'use strict';

const { onRequest } = require(
  'firebase-functions/v2/https'
);

const {
  defineSecret,
  defineString,
} = require('firebase-functions/params');

const logger = require('firebase-functions/logger');
const Iyzipay = require('iyzipay');
const cors = require('cors');

const corsHandler = cors({
  origin: [
    'https://trio-game.com',
    'https://www.trio-game.com',
    'https://trio-app-e3bea.web.app',
    'http://localhost:5000',
    'http://127.0.0.1:5000',
  ],
  methods: ['POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
});

const IYZICO_API_KEY = defineSecret('IYZICO_API_KEY');
const IYZICO_SECRET_KEY = defineSecret('IYZICO_SECRET_KEY');

/*
 * Sandbox:
 * https://sandbox-api.iyzipay.com
 *
 * Production:
 * https://api.iyzipay.com
 */
const IYZICO_BASE_URL = defineString('IYZICO_BASE_URL', {
  default: 'https://sandbox-api.iyzipay.com',
});

/*
 * Deploy sonrası callback function URL'sini buraya
 * Firebase parametresi olarak vereceğiz.
 *
 * Örnek:
 * https://europe-west1-trio-app-e3bea.cloudfunctions.net/iyzicoCallback
 */
const IYZICO_CALLBACK_URL = defineString(
  'IYZICO_CALLBACK_URL'
);

const WEBSITE_URL = defineString('WEBSITE_URL', {
  default: 'https://trio-game.com',
});

/*
 * Frontend tarafından gönderilen fiyatlara güvenilmez.
 * Gerçek fiyat yalnızca backend kataloğunda bulunur.
 */
const PRODUCT_CATALOG = Object.freeze({
  'trio-classic': {
    id: 'trio-classic',
    name: 'Trio Classic Edition',
    category1: 'Board Games',
    category2: 'Educational Games',
    unitPrice: 15,
  },
});

function createIyzicoClient() {
  return new Iyzipay({
    apiKey: IYZICO_API_KEY.value(),
    secretKey: IYZICO_SECRET_KEY.value(),
    uri: IYZICO_BASE_URL.value(),
  });
}

function createCheckoutForm(iyzipay, request) {
  return new Promise((resolve, reject) => {
    iyzipay.checkoutFormInitialize.create(
      request,
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(result);
      }
    );
  });
}

function retrieveCheckoutForm(iyzipay, request) {
  return new Promise((resolve, reject) => {
    iyzipay.checkoutForm.retrieve(
      request,
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(result);
      }
    );
  });
}

function cleanText(value, maxLength) {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .trim()
    .replace(/[<>]/g, '')
    .slice(0, maxLength);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizePhone(phone) {
  return cleanText(phone, 25)
    .replace(/[^\d+]/g, '');
}

function validateCustomer(rawCustomer) {
  const customer = {
    firstName: cleanText(rawCustomer?.firstName, 50),
    lastName: cleanText(rawCustomer?.lastName, 50),
    email: cleanText(rawCustomer?.email, 100).toLowerCase(),
    phone: normalizePhone(rawCustomer?.phone),
    identityNumber: cleanText(
      rawCustomer?.identityNumber,
      20
    ),
    address: cleanText(rawCustomer?.address, 250),
    city: cleanText(rawCustomer?.city, 80),
    zipCode: cleanText(rawCustomer?.zipCode, 20),
    country: cleanText(rawCustomer?.country, 80),
  };

  const missingFields = Object.entries(customer)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missingFields.length > 0) {
    throw new Error(
      `Missing customer fields: ${missingFields.join(', ')}`
    );
  }

  if (!isValidEmail(customer.email)) {
    throw new Error('Please enter a valid email address.');
  }

  if (customer.phone.length < 7) {
    throw new Error('Please enter a valid phone number.');
  }

  if (customer.identityNumber.length < 5) {
    throw new Error('Please enter a valid identity number.');
  }

  return customer;
}

function buildBasket(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new Error('The shopping cart is empty.');
  }

  if (rawItems.length > 10) {
    throw new Error('Too many cart items.');
  }

  const basketItems = [];
  let totalPrice = 0;

  rawItems.forEach((rawItem) => {
    const product = PRODUCT_CATALOG[rawItem?.id];

    if (!product) {
      throw new Error('An invalid product was submitted.');
    }

    const quantity = Number(rawItem.quantity);

    if (
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 10
    ) {
      throw new Error('Invalid product quantity.');
    }

    /*
     * iyzico basket item fiyatı ürün satırının toplamıdır.
     * Bir ürün 2 adet ise 15 × 2 = 30 gönderilir.
     */
    const linePrice = product.unitPrice * quantity;

    totalPrice += linePrice;

    basketItems.push({
      id: `${product.id}-${quantity}`,
      name:
        quantity > 1
          ? `${product.name} × ${quantity}`
          : product.name,
      category1: product.category1,
      category2: product.category2,
      itemType: Iyzipay.BASKET_ITEM_TYPE.PHYSICAL,
      price: linePrice.toFixed(2),
    });
  });

  return {
    basketItems,
    totalPrice: totalPrice.toFixed(2),
  };
}

function getClientIp(request) {
  const forwardedFor = request.headers['x-forwarded-for'];

  if (typeof forwardedFor === 'string') {
    return forwardedFor.split(',')[0].trim();
  }

  return request.ip || '127.0.0.1';
}

function createConversationId() {
  const timestamp = Date.now();

  const randomPart = Math.random()
    .toString(36)
    .slice(2, 10);

  return `TRIO-${timestamp}-${randomPart}`.toUpperCase();
}

function redirectToResult(response, page, parameters = {}) {
  const resultUrl = new URL(
    page,
    `${WEBSITE_URL.value().replace(/\/+$/, '')}/`
  );

  Object.entries(parameters).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      resultUrl.searchParams.set(key, String(value));
    }
  });

  response.redirect(303, resultUrl.toString());
}

exports.createIyzicoCheckout = onRequest(
  {
    region: 'europe-west1',
    cors: false,
    secrets: [
      IYZICO_API_KEY,
      IYZICO_SECRET_KEY,
    ],
    timeoutSeconds: 60,
    memory: '256MiB',
  },

  async (request, response) => {
    corsHandler(request, response, async () => {
      if (request.method === 'OPTIONS') {
        response.status(204).send('');
        return;
      }

      if (request.method !== 'POST') {
        response.status(405).json({
          success: false,
          message: 'Method not allowed.',
        });
        return;
      }

      try {
        const customer = validateCustomer(
          request.body?.customer
        );

        const { basketItems, totalPrice } = buildBasket(
          request.body?.items
        );

        const conversationId = createConversationId();
        const buyerId = conversationId;

        const iyzicoRequest = {
          locale: Iyzipay.LOCALE.EN,
          conversationId,
          price: totalPrice,
          paidPrice: totalPrice,
          currency: Iyzipay.CURRENCY.GBP,
          basketId: conversationId,
          paymentGroup: Iyzipay.PAYMENT_GROUP.PRODUCT,
          callbackUrl: IYZICO_CALLBACK_URL.value(),
          enabledInstallments: [1],

          buyer: {
            id: buyerId,
            name: customer.firstName,
            surname: customer.lastName,
            gsmNumber: customer.phone,
            email: customer.email,
            identityNumber: customer.identityNumber,
            lastLoginDate:
              new Date().toISOString().slice(0, 19).replace('T', ' '),
            registrationDate:
              new Date().toISOString().slice(0, 19).replace('T', ' '),
            registrationAddress: customer.address,
            ip: getClientIp(request),
            city: customer.city,
            country: customer.country,
            zipCode: customer.zipCode,
          },

          shippingAddress: {
            contactName:
              `${customer.firstName} ${customer.lastName}`,
            city: customer.city,
            country: customer.country,
            address: customer.address,
            zipCode: customer.zipCode,
          },

          billingAddress: {
            contactName:
              `${customer.firstName} ${customer.lastName}`,
            city: customer.city,
            country: customer.country,
            address: customer.address,
            zipCode: customer.zipCode,
          },

          basketItems,
        };

        const iyzipay = createIyzicoClient();

        const result = await createCheckoutForm(
          iyzipay,
          iyzicoRequest
        );

        if (
          result.status !== 'success' ||
          !result.paymentPageUrl ||
          !result.token
        ) {
          logger.error('iyzico checkout initialization failed', {
            status: result.status,
            errorCode: result.errorCode,
            errorMessage: result.errorMessage,
            conversationId,
          });

          response.status(400).json({
            success: false,
            message:
              result.errorMessage ||
              'The payment page could not be created.',
          });

          return;
        }

        logger.info('iyzico checkout initialized', {
          conversationId,
          token: result.token,
          totalPrice,
        });

        response.status(200).json({
          success: true,
          paymentPageUrl: result.paymentPageUrl,
        });
      } catch (error) {
        logger.error('Checkout initialization error', error);

        response.status(400).json({
          success: false,
          message:
            error.message ||
            'Payment could not be started.',
        });
      }
    });
  }
);

exports.iyzicoCallback = onRequest(
  {
    region: 'europe-west1',
    cors: false,
    secrets: [
      IYZICO_API_KEY,
      IYZICO_SECRET_KEY,
    ],
    timeoutSeconds: 60,
    memory: '256MiB',
  },

  async (request, response) => {
    if (request.method !== 'POST') {
      response.status(405).send('Method not allowed.');
      return;
    }

    try {
      /*
       * iyzico callback isteğinde token gönderir.
       * Firebase/Express form body veya JSON body'yi
       * request.body içerisinde okuyabilir.
       */
      const token = cleanText(
        request.body?.token,
        200
      );

      if (!token) {
        logger.error('iyzico callback token is missing');

        redirectToResult(
          response,
          'payment-failed.html',
          {
            reason: 'missing-token',
          }
        );

        return;
      }

      const iyzipay = createIyzicoClient();

      const result = await retrieveCheckoutForm(
        iyzipay,
        {
          locale: Iyzipay.LOCALE.EN,
          token,
        }
      );

      const paymentSuccessful =
        result.status === 'success' &&
        result.paymentStatus === 'SUCCESS';

      if (!paymentSuccessful) {
        logger.error('iyzico payment verification failed', {
          status: result.status,
          paymentStatus: result.paymentStatus,
          errorCode: result.errorCode,
          errorMessage: result.errorMessage,
          conversationId: result.conversationId,
        });

        redirectToResult(
          response,
          'payment-failed.html',
          {
            reason:
              result.errorCode ||
              result.paymentStatus ||
              'payment-failed',
          }
        );

        return;
      }

      logger.info('Trio payment verified successfully', {
        conversationId: result.conversationId,
        paymentId: result.paymentId,
        price: result.price,
        paidPrice: result.paidPrice,
        currency: result.currency,
      });

      /*
       * Burada daha sonra Firestore'a sipariş kaydı
       * ekleyebilir veya sipariş e-postası gönderebilirsin.
       *
       * Önemli:
       * Sipariş teslimatına başlamadan önce burada doğrulanan
       * paymentStatus değerini kullanmalısın.
       */

      redirectToResult(
        response,
        'payment-success.html'
      );
    } catch (error) {
      logger.error('iyzico callback error', error);

      redirectToResult(
        response,
        'payment-failed.html',
        {
          reason: 'verification-error',
        }
      );
    }
  }
);