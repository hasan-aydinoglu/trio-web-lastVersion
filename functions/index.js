'use strict';

const {
  onRequest,
} = require('firebase-functions/v2/https');

const {
  defineSecret,
  defineString,
} = require('firebase-functions/params');

const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const cors = require('cors');
const Stripe = require('stripe');
const { Resend } = require('resend');

admin.initializeApp();

const db = admin.firestore();

const STRIPE_SECRET_KEY = defineSecret(
  'STRIPE_SECRET_KEY'
);

const STRIPE_WEBHOOK_SECRET = defineSecret(
  'STRIPE_WEBHOOK_SECRET'
);

const RESEND_API_KEY = defineSecret(
  'RESEND_API_KEY'
);

const ORDER_NOTIFICATION_EMAIL =
  'hasan.aydng@gmail.com';

const ORDER_EMAIL_FROM =
  'Trio Orders <onboarding@resend.dev>';

const WEBSITE_URL = defineString(
  'WEBSITE_URL',
  {
    default: 'https://trio-game.com',
  }
);

const corsHandler = cors({
  origin: [
    'https://trio-game.com',
    'https://www.trio-game.com',
    'https://trio-app-e3bea.web.app',
    'http://localhost:5000',
    'http://127.0.0.1:5000',
    'http://localhost:5002',
    'http://127.0.0.1:5002',
  ],

  methods: [
    'POST',
    'OPTIONS',
  ],

  allowedHeaders: [
    'Content-Type',
  ],
});

const PRODUCT_CATALOG = Object.freeze({
  'trio-classic': {
    id: 'trio-classic',
    name: 'Trio Classic Edition',
    description:
      'Educational mathematics strategy board game.',
    unitAmount: 1500,
    currency: 'gbp',
  },
});

function getStripe() {
  return new Stripe(
    STRIPE_SECRET_KEY.value()
  );
}

function cleanText(
  value,
  maxLength
) {
  if (
    typeof value !== 'string'
  ) {
    return '';
  }

  return value
    .trim()
    .replace(/[<>]/g, '')
    .slice(0, maxLength);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    email
  );
}

function validateCustomer(
  rawCustomer
) {
  const customer = {
    firstName: cleanText(
      rawCustomer?.firstName,
      50
    ),

    lastName: cleanText(
      rawCustomer?.lastName,
      50
    ),

    email: cleanText(
      rawCustomer?.email,
      120
    ).toLowerCase(),

    phone: cleanText(
      rawCustomer?.phone,
      30
    ),
  };

  if (
    !customer.firstName ||
    !customer.lastName
  ) {
    throw new Error(
      'Please enter your full name.'
    );
  }

  if (
    !isValidEmail(
      customer.email
    )
  ) {
    throw new Error(
      'Please enter a valid email address.'
    );
  }

  return customer;
}

function buildLineItems(
  rawItems
) {
  if (
    !Array.isArray(rawItems) ||
    rawItems.length === 0
  ) {
    throw new Error(
      'The shopping cart is empty.'
    );
  }

  if (
    rawItems.length > 10
  ) {
    throw new Error(
      'Too many cart items.'
    );
  }

  let totalAmount = 0;

  const lineItems =
    rawItems.map(
      (rawItem) => {
        const product =
          PRODUCT_CATALOG[
            rawItem?.id
          ];

        if (!product) {
          throw new Error(
            'An invalid product was submitted.'
          );
        }

        const quantity =
          Number(
            rawItem.quantity
          );

        if (
          !Number.isInteger(
            quantity
          ) ||
          quantity < 1 ||
          quantity > 10
        ) {
          throw new Error(
            'Invalid product quantity.'
          );
        }

        totalAmount +=
          product.unitAmount *
          quantity;

        return {
          price_data: {
            currency:
              product.currency,

            product_data: {
              name:
                product.name,

              description:
                product.description,
            },

            unit_amount:
              product.unitAmount,
          },

          quantity,
        };
      }
    );

  return {
    lineItems,
    totalAmount,
  };
}

function createOrderId() {
  const timestamp =
    Date.now();

  const randomPart =
    Math.random()
      .toString(36)
      .slice(2, 10)
      .toUpperCase();

  return (
    `TRIO-${timestamp}-${randomPart}`
  );
}

function getWebsiteBaseUrl() {
  return WEBSITE_URL
    .value()
    .replace(/\/+$/, '');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatMoney(
  amount,
  currency = 'gbp'
) {
  const numericAmount =
    Number(amount || 0) / 100;

  return new Intl.NumberFormat(
    'en-GB',
    {
      style: 'currency',
      currency:
        String(
          currency || 'gbp'
        ).toUpperCase(),
    }
  ).format(
    numericAmount
  );
}

function formatAddressHtml(
  shippingDetails
) {
  const address =
    shippingDetails?.address || {};

  const lines = [
    shippingDetails?.name,
    address.line1,
    address.line2,
    address.city,
    address.state,
    address.postal_code,
    address.country,
  ]
    .filter(Boolean)
    .map(
      (line) =>
        escapeHtml(line)
    );

  return lines.length > 0
    ? lines.join('<br>')
    : 'No shipping address received.';
}

function buildOrderItemsHtml(
  items
) {
  if (
    !Array.isArray(items) ||
    items.length === 0
  ) {
    return (
      '<li>Trio Classic Edition</li>'
    );
  }

  return items
    .map(
      (item) => {
        const product =
          PRODUCT_CATALOG[
            item?.id
          ];

        const name =
          product?.name ||
          item?.id ||
          'Trio product';

        const quantity =
          Number(
            item?.quantity || 1
          );

        return (
          `<li>${escapeHtml(name)} × ` +
          `${escapeHtml(quantity)}</li>`
        );
      }
    )
    .join('');
}

async function sendOrderNotificationEmail({
  orderId,
  session,
  orderData,
}) {
  const resend =
    new Resend(
      RESEND_API_KEY.value()
    );

  const shippingDetails =
    session.shipping_details ||
    session
      .collected_information
      ?.shipping_details ||
    orderData?.shippingDetails ||
    null;

  const customerName =
    session
      .customer_details
      ?.name ||
    `${
      orderData
        ?.customer
        ?.firstName || ''
    } ${
      orderData
        ?.customer
        ?.lastName || ''
    }`.trim() ||
    'Not provided';

  const customerEmail =
    session
      .customer_details
      ?.email ||
    orderData
      ?.customer
      ?.email ||
    'Not provided';

  const customerPhone =
    session
      .customer_details
      ?.phone ||
    orderData
      ?.customer
      ?.phone ||
    'Not provided';

  const total =
    formatMoney(
      session.amount_total ??
        orderData?.totalAmount,

      session.currency ||
        orderData?.currency ||
        'gbp'
    );

  const paymentDate =
    new Date(
      Number(
        session.created ||
        Math.floor(
          Date.now() / 1000
        )
      ) * 1000
    ).toLocaleString(
      'en-GB',
      {
        timeZone:
          'Europe/London',

        dateStyle:
          'long',

        timeStyle:
          'short',
      }
    );

  const itemsHtml =
    buildOrderItemsHtml(
      orderData?.items
    );

  const {
    data,
    error,
  } =
    await resend
      .emails
      .send({
        from:
          ORDER_EMAIL_FROM,

        to: [
          ORDER_NOTIFICATION_EMAIL,
        ],

        subject:
          `New Trio order – ` +
          `${orderId} – ${total}`,

        html: `
          <div style="
            font-family: Arial, sans-serif;
            max-width: 680px;
            margin: 0 auto;
            color: #1f2937;
            line-height: 1.6;
          ">
            <div style="
              background: #111827;
              color: #ffffff;
              padding: 24px;
              border-radius: 14px 14px 0 0;
            ">
              <h1 style="
                margin: 0;
                font-size: 25px;
              ">
                New Trio Order
              </h1>

              <p style="
                margin: 6px 0 0;
              ">
                A successful payment has been received.
              </p>
            </div>

            <div style="
              border: 1px solid #e5e7eb;
              border-top: 0;
              padding: 24px;
              border-radius: 0 0 14px 14px;
            ">
              <h2 style="
                font-size: 18px;
                margin-top: 0;
              ">
                Order details
              </h2>

              <table style="
                width: 100%;
                border-collapse: collapse;
              ">
                <tr>
                  <td style="
                    padding: 8px 0;
                    font-weight: bold;
                  ">
                    Order number
                  </td>

                  <td>
                    ${escapeHtml(orderId)}
                  </td>
                </tr>

                <tr>
                  <td style="
                    padding: 8px 0;
                    font-weight: bold;
                  ">
                    Payment status
                  </td>

                  <td>
                    Paid
                  </td>
                </tr>

                <tr>
                  <td style="
                    padding: 8px 0;
                    font-weight: bold;
                  ">
                    Total
                  </td>

                  <td>
                    ${escapeHtml(total)}
                  </td>
                </tr>

                <tr>
                  <td style="
                    padding: 8px 0;
                    font-weight: bold;
                  ">
                    Payment date
                  </td>

                  <td>
                    ${escapeHtml(paymentDate)}
                  </td>
                </tr>

                <tr>
                  <td style="
                    padding: 8px 0;
                    font-weight: bold;
                  ">
                    Stripe session
                  </td>

                  <td style="
                    word-break: break-all;
                  ">
                    ${escapeHtml(session.id)}
                  </td>
                </tr>

                <tr>
                  <td style="
                    padding: 8px 0;
                    font-weight: bold;
                  ">
                    Payment intent
                  </td>

                  <td style="
                    word-break: break-all;
                  ">
                    ${escapeHtml(
                      session
                        .payment_intent ||
                      'Not provided'
                    )}
                  </td>
                </tr>
              </table>

              <hr style="
                border: 0;
                border-top: 1px solid #e5e7eb;
                margin: 24px 0;
              ">

              <h2 style="
                font-size: 18px;
              ">
                Customer
              </h2>

              <p>
                <strong>Name:</strong>
                ${escapeHtml(customerName)}
                <br>

                <strong>Email:</strong>
                ${escapeHtml(customerEmail)}
                <br>

                <strong>Phone:</strong>
                ${escapeHtml(customerPhone)}
              </p>

              <h2 style="
                font-size: 18px;
              ">
                Shipping address
              </h2>

              <p>
                ${formatAddressHtml(
                  shippingDetails
                )}
              </p>

              <h2 style="
                font-size: 18px;
              ">
                Products
              </h2>

              <ul>
                ${itemsHtml}
              </ul>

              <p style="
                margin-top: 28px;
                padding: 14px;
                background: #f3f4f6;
                border-radius: 10px;
              ">
                This email was generated automatically
                after Stripe confirmed the payment.
              </p>
            </div>
          </div>
        `,
      });

  if (error) {
    throw new Error(
      `Resend email failed: ${
        error.message ||
        JSON.stringify(error)
      }`
    );
  }

  return data;
}

exports.createStripeCheckout =
  onRequest(
    {
      region:
        'europe-west1',

      cors: false,

      secrets: [
        STRIPE_SECRET_KEY,
      ],

      timeoutSeconds: 60,

      memory:
        '256MiB',
    },

    async (
      request,
      response
    ) => {
      corsHandler(
        request,
        response,

        async () => {
          if (
            request.method ===
            'OPTIONS'
          ) {
            response
              .status(204)
              .send('');

            return;
          }

          if (
            request.method !==
            'POST'
          ) {
            response
              .status(405)
              .json({
                success: false,

                message:
                  'Method not allowed.',
              });

            return;
          }

          try {
            const customer =
              validateCustomer(
                request
                  .body
                  ?.customer
              );

            const {
              lineItems,
              totalAmount,
            } =
              buildLineItems(
                request
                  .body
                  ?.items
              );

            const orderId =
              createOrderId();

            const websiteUrl =
              getWebsiteBaseUrl();

            const stripe =
              getStripe();

            const orderReference =
              db
                .collection(
                  'orders'
                )
                .doc(
                  orderId
                );

            await orderReference.set({
              orderId,

              status:
                'checkout_created',

              paymentProvider:
                'stripe',

              market:
                'UK',

              currency:
                'gbp',

              totalAmount,

              customer,

              items:
                request.body.items,

              createdAt:
                admin
                  .firestore
                  .FieldValue
                  .serverTimestamp(),

              updatedAt:
                admin
                  .firestore
                  .FieldValue
                  .serverTimestamp(),
            });

            const session =
              await stripe
                .checkout
                .sessions
                .create({
                  mode:
                    'payment',

                  customer_email:
                    customer.email,

                  client_reference_id:
                    orderId,

                  line_items:
                    lineItems,

                  shipping_address_collection:
                    {
                      allowed_countries:
                        [
                          'GB',
                        ],
                    },

                  phone_number_collection:
                    {
                      enabled:
                        true,
                    },

                  billing_address_collection:
                    'auto',

                  success_url:
                    `${websiteUrl}/payment-success.html` +
                    '?session_id={CHECKOUT_SESSION_ID}',

                  cancel_url:
                    `${websiteUrl}/payment-failed.html` +
                    '?reason=cancelled',

                  metadata: {
                    orderId,

                    market:
                      'UK',
                  },

                  payment_intent_data:
                    {
                      metadata:
                        {
                          orderId,

                          market:
                            'UK',
                        },
                    },
                });

            await orderReference.update({
              stripeCheckoutSessionId:
                session.id,

              updatedAt:
                admin
                  .firestore
                  .FieldValue
                  .serverTimestamp(),
            });

            logger.info(
              'Stripe Checkout Session created',
              {
                orderId,

                sessionId:
                  session.id,

                totalAmount,
              }
            );

            response
              .status(200)
              .json({
                success: true,

                orderId,

                checkoutUrl:
                  session.url,

                paymentPageUrl:
                  session.url,
              });
          } catch (error) {
            logger.error(
              'Stripe checkout creation failed',
              {
                message:
                  error.message,

                type:
                  error.type,

                code:
                  error.code,
              }
            );

            response
              .status(400)
              .json({
                success: false,

                message:
                  error.message ||
                  'The payment page could not be created.',
              });
          }
        }
      );
    }
  );

exports.stripeWebhook =
  onRequest(
    {
      region:
        'europe-west1',

      cors: false,

      secrets: [
        STRIPE_SECRET_KEY,
        STRIPE_WEBHOOK_SECRET,
        RESEND_API_KEY,
      ],

      timeoutSeconds: 60,

      memory:
        '256MiB',
    },

    async (
      request,
      response
    ) => {
      if (
        request.method !==
        'POST'
      ) {
        response
          .status(405)
          .send(
            'Method not allowed.'
          );

        return;
      }

      const signature =
        request.headers[
          'stripe-signature'
        ];

      if (!signature) {
        response
          .status(400)
          .send(
            'Missing Stripe-Signature header.'
          );

        return;
      }

      let event;

      try {
        const stripe =
          getStripe();

        event =
          stripe
            .webhooks
            .constructEvent(
              request.rawBody,

              signature,

              STRIPE_WEBHOOK_SECRET
                .value()
            );
      } catch (error) {
        logger.error(
          'Stripe webhook verification failed',
          {
            message:
              error.message,
          }
        );

        response
          .status(400)
          .send(
            `Webhook Error: ${error.message}`
          );

        return;
      }

      try {
        if (
          event.type ===
          'checkout.session.completed'
        ) {
          const session =
            event.data.object;

          const orderId =
            session
              .client_reference_id ||
            session
              .metadata
              ?.orderId;

          if (orderId) {
            const orderReference =
              db
                .collection(
                  'orders'
                )
                .doc(
                  orderId
                );

            await orderReference.set(
              {
                status:
                  session
                    .payment_status ===
                  'paid'
                    ? 'paid'
                    : 'payment_processing',

                stripeCheckoutSessionId:
                  session.id,

                stripePaymentIntentId:
                  session
                    .payment_intent ||
                  null,

                stripeCustomerId:
                  session
                    .customer ||
                  null,

                customerEmail:
                  session
                    .customer_details
                    ?.email ||
                  null,

                customerName:
                  session
                    .customer_details
                    ?.name ||
                  null,

                customerPhone:
                  session
                    .customer_details
                    ?.phone ||
                  null,

                shippingDetails:
                  session
                    .shipping_details ||
                  session
                    .collected_information
                    ?.shipping_details ||
                  null,

                amountTotal:
                  session
                    .amount_total ||
                  null,

                currency:
                  session
                    .currency ||
                  'gbp',

                updatedAt:
                  admin
                    .firestore
                    .FieldValue
                    .serverTimestamp(),
              },

              {
                merge: true,
              }
            );

            const orderSnapshot =
              await orderReference.get();

            const orderData =
              orderSnapshot.data() || {};

            if (
              session.payment_status ===
                'paid' &&
              orderData
                .notificationEmailSent !==
                true
            ) {
              try {
                const emailResult =
                  await sendOrderNotificationEmail({
                    orderId,
                    session,
                    orderData,
                  });

                await orderReference.set(
                  {
                    notificationEmailSent:
                      true,

                    notificationEmailId:
                      emailResult?.id ||
                      null,

                    notificationEmailSentAt:
                      admin
                        .firestore
                        .FieldValue
                        .serverTimestamp(),

                    notificationEmailError:
                      admin
                        .firestore
                        .FieldValue
                        .delete(),
                  },

                  {
                    merge: true,
                  }
                );

                logger.info(
                  'Order notification email sent',
                  {
                    orderId,

                    emailId:
                      emailResult?.id ||
                      null,
                  }
                );
              } catch (
                emailError
              ) {
                await orderReference.set(
                  {
                    notificationEmailSent:
                      false,

                    notificationEmailError:
                      emailError.message,

                    notificationEmailLastAttemptAt:
                      admin
                        .firestore
                        .FieldValue
                        .serverTimestamp(),
                  },

                  {
                    merge: true,
                  }
                );

                logger.error(
                  'Order notification email failed',
                  {
                    orderId,

                    message:
                      emailError.message,
                  }
                );
              }
            }
          }

          logger.info(
            'Stripe payment completed',
            {
              orderId,

              sessionId:
                session.id,

              paymentStatus:
                session
                  .payment_status,
            }
          );
        }

        else if (
          event.type ===
          'checkout.session.async_payment_succeeded'
        ) {
          const session =
            event.data.object;

          const orderId =
            session
              .client_reference_id ||
            session
              .metadata
              ?.orderId;

          if (orderId) {
            await db
              .collection(
                'orders'
              )
              .doc(
                orderId
              )
              .set(
                {
                  status:
                    'paid',

                  updatedAt:
                    admin
                      .firestore
                      .FieldValue
                      .serverTimestamp(),
                },

                {
                  merge: true,
                }
              );
          }
        }

        else if (
          event.type ===
          'checkout.session.async_payment_failed'
        ) {
          const session =
            event.data.object;

          const orderId =
            session
              .client_reference_id ||
            session
              .metadata
              ?.orderId;

          if (orderId) {
            await db
              .collection(
                'orders'
              )
              .doc(
                orderId
              )
              .set(
                {
                  status:
                    'payment_failed',

                  updatedAt:
                    admin
                      .firestore
                      .FieldValue
                      .serverTimestamp(),
                },

                {
                  merge: true,
                }
              );
          }
        }

        else {
          logger.info(
            'Unhandled Stripe event',
            {
              eventType:
                event.type,
            }
          );
        }

        response
          .status(200)
          .json({
            received: true,
          });
      } catch (error) {
        logger.error(
          'Stripe webhook processing failed',
          {
            message:
              error.message,

            eventType:
              event.type,
          }
        );

        response
          .status(500)
          .send(
            'Webhook processing failed.'
          );
      }
    }
  );