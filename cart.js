document.addEventListener('DOMContentLoaded', () => {
  /*
   * Firebase Stripe Checkout Function adresi.
   */
  const CHECKOUT_ENDPOINT =
    'https://europe-west1-trio-app-e3bea.cloudfunctions.net/createStripeCheckout';

  const cartItemsElement = document.getElementById('cartItems');
  const emptyCartElement = document.getElementById('emptyCart');
  const orderSummaryElement = document.getElementById('orderSummary');
  const cartItemCountElement =
    document.getElementById('cartItemCount');

  const subtotalElement = document.getElementById('subtotal');
  const grandTotalElement = document.getElementById('grandTotal');

  const checkoutForm = document.getElementById('checkoutForm');
  const checkoutButton = document.getElementById('checkoutButton');
  const checkoutError = document.getElementById('checkoutError');

  function getCart() {
    try {
      const savedCart = JSON.parse(
        localStorage.getItem('trioCart')
      );

      return Array.isArray(savedCart)
        ? savedCart
        : [];
    } catch (error) {
      console.error(
        'Cart could not be read:',
        error
      );

      return [];
    }
  }

  function saveCart(cart) {
    localStorage.setItem(
      'trioCart',
      JSON.stringify(cart)
    );
  }

  function formatMoney(value) {
    return Number(value).toFixed(2);
  }

  function getTotalQuantity(cart) {
    return cart.reduce(
      (total, item) =>
        total +
        Number(item.quantity || 0),
      0
    );
  }

  function updateQuantity(productId, change) {
    const cart = getCart();

    const item = cart.find(
      (cartItem) =>
        cartItem.id === productId
    );

    if (!item) {
      return;
    }

    const currentQuantity =
      Number(item.quantity || 1);

    const newQuantity =
      currentQuantity + change;

    if (newQuantity < 1) {
      return;
    }

    item.quantity =
      Math.min(10, newQuantity);

    saveCart(cart);
    renderCart();
  }

  function removeItem(productId) {
    const cart = getCart().filter(
      (item) =>
        item.id !== productId
    );

    saveCart(cart);
    renderCart();
  }

  function createCartItem(item) {
    const itemElement =
      document.createElement('article');

    itemElement.className =
      'cart-item';

    const safeQuantity =
      Math.min(
        10,
        Math.max(
          1,
          Number(item.quantity || 1)
        )
      );

    const unitPrice =
      Number(item.price || 15);

    const lineTotal =
      unitPrice * safeQuantity;

    itemElement.innerHTML = `
      <img
        src="${item.image || 'trio-face.png'}"
        alt="${item.name || 'Trio Classic Edition'}"
        class="cart-item-image"
      >

      <div class="cart-item-info">
        <h3>
          ${item.name || 'Trio Classic Edition'}
        </h3>

        <p>
          £${formatMoney(unitPrice)} each
        </p>

        <div class="quantity-control">
          <button
            type="button"
            class="decrease-item"
            aria-label="Decrease quantity"
          >
            <i class="fa-solid fa-minus"></i>
          </button>

          <span>${safeQuantity}</span>

          <button
            type="button"
            class="increase-item"
            aria-label="Increase quantity"
          >
            <i class="fa-solid fa-plus"></i>
          </button>
        </div>
      </div>

      <div class="cart-item-price">
        <strong>
          £${formatMoney(lineTotal)}
        </strong>

        <button
          type="button"
          class="remove-button"
          aria-label="Remove product"
        >
          <i class="fa-solid fa-trash"></i>
          Remove
        </button>
      </div>
    `;

    itemElement
      .querySelector('.decrease-item')
      ?.addEventListener(
        'click',
        () => {
          updateQuantity(
            item.id,
            -1
          );
        }
      );

    itemElement
      .querySelector('.increase-item')
      ?.addEventListener(
        'click',
        () => {
          updateQuantity(
            item.id,
            1
          );
        }
      );

    itemElement
      .querySelector('.remove-button')
      ?.addEventListener(
        'click',
        () => {
          removeItem(item.id);
        }
      );

    return itemElement;
  }

  function renderCart() {
    const cart = getCart();

    cartItemsElement.innerHTML = '';

    if (cart.length === 0) {
      emptyCartElement.hidden = false;
      orderSummaryElement.hidden = true;
      checkoutForm.hidden = true;

      cartItemCountElement.textContent =
        '0 items';

      return;
    }

    emptyCartElement.hidden = true;
    orderSummaryElement.hidden = false;
    checkoutForm.hidden = false;

    cart.forEach((item) => {
      cartItemsElement.appendChild(
        createCartItem(item)
      );
    });

    const totalQuantity =
      getTotalQuantity(cart);

    /*
     * Bu toplam yalnızca ekranda gösterilir.
     * Gerçek ödeme tutarı Firebase backend
     * tarafından güvenli şekilde hesaplanır.
     */
    const subtotal = cart.reduce(
      (total, item) => {
        const price =
          Number(item.price || 15);

        const quantity =
          Math.min(
            10,
            Math.max(
              1,
              Number(item.quantity || 1)
            )
          );

        return total +
          price * quantity;
      },
      0
    );

    cartItemCountElement.textContent =
      `${totalQuantity} ${
        totalQuantity === 1
          ? 'item'
          : 'items'
      }`;

    subtotalElement.textContent =
      formatMoney(subtotal);

    grandTotalElement.textContent =
      formatMoney(subtotal);
  }

  function showError(message) {
    checkoutError.textContent =
      message;

    checkoutError.hidden = false;

    checkoutError.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }

  function clearError() {
    checkoutError.textContent = '';
    checkoutError.hidden = true;
  }

  function setCheckoutLoading(
    isLoading
  ) {
    checkoutButton.disabled =
      isLoading;

    checkoutButton.innerHTML =
      isLoading
        ? `
          <span>
            Preparing secure payment...
          </span>

          <i
            class="fa-solid fa-spinner fa-spin"
          ></i>
        `
        : `
          <span>
            Continue to secure payment
          </span>

          <i
            class="fa-solid fa-arrow-right"
          ></i>
        `;
  }

  function getCustomerData() {
    return {
      firstName:
        document
          .getElementById('firstName')
          .value
          .trim(),

      lastName:
        document
          .getElementById('lastName')
          .value
          .trim(),

      email:
        document
          .getElementById('email')
          .value
          .trim(),

      phone:
        document
          .getElementById('phone')
          .value
          .trim(),
    };
  }

  checkoutForm.addEventListener(
    'submit',
    async (event) => {
      event.preventDefault();
      clearError();

      const cart = getCart();

      if (cart.length === 0) {
        showError(
          'Your cart is empty.'
        );

        return;
      }

      if (
        !checkoutForm.checkValidity()
      ) {
        checkoutForm.reportValidity();
        return;
      }

      const termsAccepted =
        document
          .getElementById(
            'termsAccepted'
          )
          .checked;

      if (!termsAccepted) {
        showError(
          'Please confirm that your order details are correct.'
        );

        return;
      }

      const customer =
        getCustomerData();

      /*
       * Stripe backend yalnızca ürün ID ve
       * miktar bilgisini kullanır.
       *
       * Ürün ID mutlaka backend ile aynı olmalıdır:
       * trio-classic
       */
      const items = cart.map(
        (item) => ({
          id:
            item.id ||
            'trio-classic',

          quantity:
            Math.min(
              10,
              Math.max(
                1,
                Number(
                  item.quantity || 1
                )
              )
            ),
        })
      );

      setCheckoutLoading(true);

      try {
        const response =
          await fetch(
            CHECKOUT_ENDPOINT,
            {
              method: 'POST',

              headers: {
                'Content-Type':
                  'application/json',
              },

              body:
                JSON.stringify({
                  customer,
                  items,
                }),
            }
          );

        let result;

        try {
          result =
            await response.json();
        } catch (jsonError) {
          throw new Error(
            'The payment server returned an invalid response.'
          );
        }

        if (
          !response.ok ||
          !result.success
        ) {
          throw new Error(
            result.message ||
            result.errorMessage ||
            'Payment could not be started.'
          );
        }

        const checkoutUrl =
          result.checkoutUrl ||
          result.paymentPageUrl;

        if (!checkoutUrl) {
          throw new Error(
            'The secure Stripe payment page URL was not returned.'
          );
        }

        /*
         * Sepeti burada silmiyoruz.
         * Ödeme başarıyla tamamlandıktan sonra
         * payment-success.html sayfasında silinecek.
         */
        window.location.assign(
          checkoutUrl
        );
      } catch (error) {
        console.error(
          'Stripe checkout error:',
          error
        );

        showError(
          error.message ||
          'An unexpected payment error occurred.'
        );

        setCheckoutLoading(false);
      }
    }
  );

  renderCart();
});