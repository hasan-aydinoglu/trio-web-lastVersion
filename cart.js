document.addEventListener('DOMContentLoaded', () => {
  /*
   * Firebase Functions deploy edildikten sonra adres genellikle:
   *
   * https://europe-west1-PROJECT_ID.cloudfunctions.net
   *
   * Senin proje adına göre:
   */
  const FUNCTION_BASE_URL =
    'https://europe-west1-trio-app-e3bea.cloudfunctions.net';

  const CHECKOUT_ENDPOINT =
    `${FUNCTION_BASE_URL}/createIyzicoCheckout`;

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

      return Array.isArray(savedCart) ? savedCart : [];
    } catch (error) {
      console.error('Cart could not be read:', error);
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
      (total, item) => total + Number(item.quantity || 0),
      0
    );
  }

  function updateQuantity(productId, change) {
    const cart = getCart();

    const item = cart.find(
      (cartItem) => cartItem.id === productId
    );

    if (!item) {
      return;
    }

    const newQuantity = Number(item.quantity || 1) + change;

    if (newQuantity < 1) {
      return;
    }

    item.quantity = Math.min(10, newQuantity);

    saveCart(cart);
    renderCart();
  }

  function removeItem(productId) {
    const cart = getCart().filter(
      (item) => item.id !== productId
    );

    saveCart(cart);
    renderCart();
  }

  function createCartItem(item) {
    const itemElement = document.createElement('article');
    itemElement.className = 'cart-item';

    const safeQuantity = Math.min(
      10,
      Math.max(1, Number(item.quantity || 1))
    );

    const lineTotal = Number(item.price || 0) * safeQuantity;

    itemElement.innerHTML = `
      <img
        src="${item.image || 'trio-face.png'}"
        alt="${item.name || 'Trio Classic Edition'}"
        class="cart-item-image"
      >

      <div class="cart-item-info">
        <h3>${item.name || 'Trio Classic Edition'}</h3>
        <p>£${formatMoney(item.price || 15)} each</p>

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
        <strong>£${formatMoney(lineTotal)}</strong>

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
      ?.addEventListener('click', () => {
        updateQuantity(item.id, -1);
      });

    itemElement
      .querySelector('.increase-item')
      ?.addEventListener('click', () => {
        updateQuantity(item.id, 1);
      });

    itemElement
      .querySelector('.remove-button')
      ?.addEventListener('click', () => {
        removeItem(item.id);
      });

    return itemElement;
  }

  function renderCart() {
    const cart = getCart();

    cartItemsElement.innerHTML = '';

    if (cart.length === 0) {
      emptyCartElement.hidden = false;
      orderSummaryElement.hidden = true;
      checkoutForm.hidden = true;
      cartItemCountElement.textContent = '0 items';
      return;
    }

    emptyCartElement.hidden = true;
    orderSummaryElement.hidden = false;
    checkoutForm.hidden = false;

    cart.forEach((item) => {
      cartItemsElement.appendChild(createCartItem(item));
    });

    const totalQuantity = getTotalQuantity(cart);

    /*
     * Bu sadece ekranda göstermek içindir.
     * Gerçek fiyat backend tarafından yeniden hesaplanır.
     */
    const subtotal = cart.reduce((total, item) => {
      return total +
        Number(item.price || 0) *
        Number(item.quantity || 1);
    }, 0);

    cartItemCountElement.textContent =
      `${totalQuantity} ${totalQuantity === 1 ? 'item' : 'items'}`;

    subtotalElement.textContent = formatMoney(subtotal);
    grandTotalElement.textContent = formatMoney(subtotal);
  }

  function showError(message) {
    checkoutError.textContent = message;
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

  function setCheckoutLoading(isLoading) {
    checkoutButton.disabled = isLoading;

    checkoutButton.innerHTML = isLoading
      ? `
        <span>Preparing secure payment...</span>
        <i class="fa-solid fa-spinner fa-spin"></i>
      `
      : `
        <span>Continue to secure payment</span>
        <i class="fa-solid fa-arrow-right"></i>
      `;
  }

  function getCustomerData() {
    return {
      firstName:
        document.getElementById('firstName').value.trim(),

      lastName:
        document.getElementById('lastName').value.trim(),

      email:
        document.getElementById('email').value.trim(),

      phone:
        document.getElementById('phone').value.trim(),

      identityNumber:
        document.getElementById('identityNumber').value.trim(),

      address:
        document.getElementById('address').value.trim(),

      city:
        document.getElementById('city').value.trim(),

      zipCode:
        document.getElementById('zipCode').value.trim(),

      country:
        document.getElementById('country').value,
    };
  }

  checkoutForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError();

    const cart = getCart();

    if (cart.length === 0) {
      showError('Your cart is empty.');
      return;
    }

    if (!checkoutForm.checkValidity()) {
      checkoutForm.reportValidity();
      return;
    }

    const termsAccepted =
      document.getElementById('termsAccepted').checked;

    if (!termsAccepted) {
      showError(
        'Please confirm that your order details are correct.'
      );
      return;
    }

    const customer = getCustomerData();

    const items = cart.map((item) => ({
      id: item.id,
      quantity: Number(item.quantity || 1),
    }));

    setCheckoutLoading(true);

    try {
      const response = await fetch(CHECKOUT_ENDPOINT, {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json',
        },

        body: JSON.stringify({
          customer,
          items,
        }),
      });

      let result;

      try {
        result = await response.json();
      } catch (jsonError) {
        throw new Error(
          'The payment server returned an invalid response.'
        );
      }

      if (!response.ok) {
        throw new Error(
          result.message ||
          result.errorMessage ||
          'Payment could not be started.'
        );
      }

      if (!result.paymentPageUrl) {
        throw new Error(
          'The secure payment page URL was not returned.'
        );
      }

      /*
       * Sepeti burada silmiyoruz.
       * Sepet yalnızca doğrulanmış başarılı ödemeden sonra
       * success sayfasında temizlenecek.
       */
      window.location.assign(result.paymentPageUrl);
    } catch (error) {
      console.error('Checkout error:', error);

      showError(
        error.message ||
        'An unexpected payment error occurred.'
      );

      setCheckoutLoading(false);
    }
  });

  renderCart();
});