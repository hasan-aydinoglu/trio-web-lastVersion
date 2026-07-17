const { setGlobalOptions } = require("firebase-functions/v2");
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");

const admin = require("firebase-admin");
const Iyzipay = require("iyzipay");
const cors = require("cors")({
  origin: [
    "https://trio-game.com",
    "https://www.trio-game.com",
    "https://trio-app-e3bea.web.app",
    "https://trio-app-e3bea.firebaseapp.com",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
  ],
  methods: ["POST", "OPTIONS"],
});

admin.initializeApp();

const db = admin.firestore();

setGlobalOptions({
  region: "us-central1",
  maxInstances: 10,
});

const IYZICO_API_KEY = defineSecret("IYZICO_API_KEY");
const IYZICO_SECRET_KEY = defineSecret("IYZICO_SECRET_KEY");

const IYZICO_BASE_URL = "https://sandbox-api.iyzipay.com";

const CALLBACK_URL =
  "https://us-central1-trio-app-e3bea.cloudfunctions.net/iyzicoCallback";

const SUCCESS_URL = "https://trio-game.com/payment-success.html";
const FAILURE_URL = "https://trio-game.com/payment-failed.html";

/*
 * Buradaki fiyatı Trio'nun gerçek TL satış fiyatına göre değiştir.
 * Örnek olarak 499 TL yazılmıştır.
 */
const TRIO_UNIT_PRICE = 499;

function createIyzipayClient() {
  return new Iyzipay({
    apiKey: IYZICO_API_KEY.value(),
    secretKey: IYZICO_SECRET_KEY.value(),
    uri: IYZICO_BASE_URL,
  });
}

function cleanText(value, maximumLength = 250) {
  return String(value || "")
    .trim()
    .slice(0, maximumLength);
}

function normalizePhone(value) {
  let phone = String(value || "").replace(/[^\d+]/g, "");

  if (phone.startsWith("0090")) {
    phone = `+90${phone.slice(4)}`;
  }

  if (phone.startsWith("0") && phone.length === 11) {
    phone = `+90${phone.slice(1)}`;
  }

  if (!phone.startsWith("+")) {
    phone = `+${phone}`;
  }

  return phone;
}

function generateOrderId() {
  const timestamp = Date.now();
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();

  return `TRIO-${timestamp}-${randomPart}`;
}

function validateCheckoutRequest(body) {
  const requiredFields = [
    "firstName",
    "lastName",
    "email",
    "phone",
    "address",
    "city",
  ];

  const missingFields = requiredFields.filter(
    (field) => !cleanText(body[field]),
  );

  if (missingFields.length > 0) {
    return `Eksik alanlar: ${missingFields.join(", ")}`;
  }

  const email = cleanText(body.email);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "Geçerli bir e-posta adresi girilmelidir.";
  }

  const quantity = Number(body.quantity);

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
    return "Ürün adedi 1 ile 10 arasında olmalıdır.";
  }

  return null;
}

exports.createIyzicoCheckout = onRequest(
  {
    secrets: [IYZICO_API_KEY, IYZICO_SECRET_KEY],
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  (request, response) => {
    cors(request, response, async () => {
      if (request.method === "OPTIONS") {
        response.status(204).send("");
        return;
      }

      if (request.method !== "POST") {
        response.status(405).json({
          success: false,
          message: "Yalnızca POST isteği kullanılabilir.",
        });
        return;
      }

      try {
        const body = request.body || {};
        const validationError = validateCheckoutRequest(body);

        if (validationError) {
          response.status(400).json({
            success: false,
            message: validationError,
          });
          return;
        }

        const quantity = Number(body.quantity);
        const totalPrice = TRIO_UNIT_PRICE * quantity;
        const orderId = generateOrderId();

        const firstName = cleanText(body.firstName, 50);
        const lastName = cleanText(body.lastName, 50);
        const email = cleanText(body.email, 120).toLowerCase();
        const phone = normalizePhone(body.phone);
        const address = cleanText(body.address, 500);
        const city = cleanText(body.city, 100);
        const district = cleanText(body.district || city, 100);
        const postalCode = cleanText(body.postalCode || "34000", 20);
        const note = cleanText(body.note, 500);

        /*
         * Sandbox testlerinde 11111111111 kullanılabilir.
         * Canlı ortamda müşterinin gerçek ve geçerli kimlik bilgisi
         * veya iyzico hesabınıza uygun alıcı bilgisi kullanılmalıdır.
         */
        const identityNumber = cleanText(
          body.identityNumber || "11111111111",
          11,
        );

        const orderReference = db.collection("orders").doc(orderId);

        await orderReference.set({
          orderId,
          status: "payment_pending",
          environment: "sandbox",
          product: {
            id: "TRIO-CLASSIC",
            name: "Trio Classic",
            category: "Board Game",
            quantity,
            unitPrice: TRIO_UNIT_PRICE,
            totalPrice,
            currency: "TRY",
          },
          customer: {
            firstName,
            lastName,
            email,
            phone,
            identityNumber,
          },
          shippingAddress: {
            address,
            city,
            district,
            postalCode,
            country: "Türkiye",
          },
          note,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        const iyzipay = createIyzipayClient();

        const iyzicoRequest = {
          locale: Iyzipay.LOCALE.TR,
          conversationId: orderId,
          price: totalPrice.toFixed(2),
          paidPrice: totalPrice.toFixed(2),
          currency: Iyzipay.CURRENCY.TRY,
          basketId: orderId,
          paymentGroup: Iyzipay.PAYMENT_GROUP.PRODUCT,
          callbackUrl: CALLBACK_URL,
          enabledInstallments: [1],

          buyer: {
            id: orderId,
            name: firstName,
            surname: lastName,
            gsmNumber: phone,
            email,
            identityNumber,
            registrationAddress: address,
            ip: request.ip || "127.0.0.1",
            city,
            country: "Turkey",
            zipCode: postalCode,
          },

          shippingAddress: {
            contactName: `${firstName} ${lastName}`,
            city,
            country: "Turkey",
            address,
            zipCode: postalCode,
          },

          billingAddress: {
            contactName: `${firstName} ${lastName}`,
            city,
            country: "Turkey",
            address,
            zipCode: postalCode,
          },

          basketItems: [
            {
              id: "TRIO-CLASSIC",
              name: "Trio Classic",
              category1: "Board Games",
              category2: "Educational Games",
              itemType: Iyzipay.BASKET_ITEM_TYPE.PHYSICAL,
              price: totalPrice.toFixed(2),
            },
          ],
        };

        iyzipay.checkoutFormInitialize.create(
          iyzicoRequest,
          async (error, result) => {
            if (error) {
              logger.error("iyzico Checkout Form error", error);

              await orderReference.update({
                status: "checkout_initialization_failed",
                errorMessage: error.message || String(error),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              });

              response.status(500).json({
                success: false,
                message: "Ödeme sayfası oluşturulamadı.",
              });

              return;
            }

            if (!result || result.status !== "success") {
              logger.error("iyzico Checkout Form failed", result);

              await orderReference.update({
                status: "checkout_initialization_failed",
                iyzicoErrorCode: result?.errorCode || null,
                iyzicoErrorMessage: result?.errorMessage || null,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              });

              response.status(400).json({
                success: false,
                message:
                  result?.errorMessage ||
                  "iyzico ödeme sayfası oluşturulamadı.",
              });

              return;
            }

            await orderReference.update({
              status: "checkout_initialized",
              iyzicoToken: result.token,
              paymentPageUrl: result.paymentPageUrl || null,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            response.status(200).json({
              success: true,
              orderId,
              token: result.token,
              paymentPageUrl: result.paymentPageUrl,
              checkoutFormContent: result.checkoutFormContent,
            });
          },
        );
      } catch (error) {
        logger.error("createIyzicoCheckout unexpected error", error);

        response.status(500).json({
          success: false,
          message: "Beklenmeyen bir sunucu hatası oluştu.",
        });
      }
    });
  },
);

exports.iyzicoCallback = onRequest(
  {
    secrets: [IYZICO_API_KEY, IYZICO_SECRET_KEY],
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (request, response) => {
    if (request.method !== "POST") {
      response.status(405).send("Method Not Allowed");
      return;
    }

    try {
      const token =
        cleanText(request.body?.token, 500) ||
        cleanText(request.query?.token, 500);

      if (!token) {
        logger.error("iyzico callback token missing");

        response.redirect(
          303,
          `${FAILURE_URL}?reason=missing-token`,
        );

        return;
      }

      const iyzipay = createIyzipayClient();

      iyzipay.checkoutForm.retrieve(
        {
          locale: Iyzipay.LOCALE.TR,
          token,
        },
        async (error, result) => {
          if (error) {
            logger.error("iyzico payment retrieve error", error);

            response.redirect(
              303,
              `${FAILURE_URL}?reason=verification-error`,
            );

            return;
          }

          const orderId = cleanText(result?.conversationId, 150);
          const paymentSuccessful =
            result?.status === "success" &&
            result?.paymentStatus === "SUCCESS";

          if (!orderId) {
            logger.error("Order ID missing in iyzico result", result);

            response.redirect(
              303,
              `${FAILURE_URL}?reason=order-not-found`,
            );

            return;
          }

          const orderReference = db.collection("orders").doc(orderId);
          const orderSnapshot = await orderReference.get();

          if (!orderSnapshot.exists) {
            logger.error("Order does not exist", { orderId });

            response.redirect(
              303,
              `${FAILURE_URL}?reason=order-not-found`,
            );

            return;
          }

          const orderData = orderSnapshot.data();
          const expectedPrice = Number(
            orderData?.product?.totalPrice || 0,
          );

          const returnedPrice = Number(
            result?.paidPrice || result?.price || 0,
          );

          const priceMatches =
            Math.abs(expectedPrice - returnedPrice) < 0.01;

          if (paymentSuccessful && priceMatches) {
            await orderReference.update({
              status: "paid",
              paymentStatus: result.paymentStatus,
              paymentId: result.paymentId || null,
              paymentConversationId: result.conversationId || null,
              iyzicoToken: token,
              paidPrice: returnedPrice,
              currency: result.currency || "TRY",
              cardType: result.cardType || null,
              cardAssociation: result.cardAssociation || null,
              cardFamily: result.cardFamily || null,
              binNumber: result.binNumber || null,
              lastFourDigits: result.lastFourDigits || null,
              fraudStatus: result.fraudStatus ?? null,
              paymentCompletedAt:
                admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            response.redirect(
              303,
              `${SUCCESS_URL}?orderId=${encodeURIComponent(orderId)}`,
            );

            return;
          }

          await orderReference.update({
            status: priceMatches
              ? "payment_failed"
              : "payment_amount_mismatch",
            paymentStatus: result?.paymentStatus || null,
            iyzicoStatus: result?.status || null,
            iyzicoErrorCode: result?.errorCode || null,
            iyzicoErrorMessage: result?.errorMessage || null,
            returnedPrice,
            expectedPrice,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          response.redirect(
            303,
            `${FAILURE_URL}?orderId=${encodeURIComponent(orderId)}`,
          );
        },
      );
    } catch (error) {
      logger.error("iyzicoCallback unexpected error", error);

      response.redirect(
        303,
        `${FAILURE_URL}?reason=server-error`,
      );
    }
  },
);