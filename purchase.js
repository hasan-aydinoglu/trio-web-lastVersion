document.addEventListener('DOMContentLoaded', () => {
  const PRODUCT = {
    id: 'trio-classic',
    name: 'Trio Classic Edition',
    price: 15,
    image: 'trio-face.png',
  };

  const quantityInput = document.getElementById('quantity');
  const decreaseButton = document.getElementById('decreaseQuantity');
  const increaseButton = document.getElementById('increaseQuantity');
  const totalPriceElement = document.getElementById('totalPrice');
  const addCartButton = document.getElementById('addCartButton');
  const buyNowButton = document.getElementById('buyNowButton');
  const cartCountElement = document.getElementById('cart-count');

  const cartNotification = document.getElementById('cartNotification');
  const notificationMessage = document.getElementById(
    'notificationMessage'
  );

  const mainProductImage = document.getElementById(
    'mainProductImage'
  );

  const thumbnailButtons = document.querySelectorAll(
    '.thumbnail-button'
  );

  const mobileMenuButton = document.getElementById(
    'mobileMenuButton'
  );

  const navigationLinks = document.getElementById(
    'navigationLinks'
  );

  let notificationTimeout;

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

    updateCartCount();
  }

  function getQuantity() {
    const quantity = Number(quantityInput?.value || 1);

    if (!Number.isInteger(quantity)) {
      return 1;
    }

    return Math.min(10, Math.max(1, quantity));
  }

  function updateTotal() {
    const quantity = getQuantity();
    const total = PRODUCT.price * quantity;

    if (quantityInput) {
      quantityInput.value = String(quantity);
    }

    if (totalPriceElement) {
      totalPriceElement.textContent = total.toFixed(2);
    }
  }

  function updateCartCount() {
    const cart = getCart();

    const totalQuantity = cart.reduce(
      (total, item) => total + Number(item.quantity || 0),
      0
    );

    if (cartCountElement) {
      cartCountElement.textContent = String(totalQuantity);
    }
  }

  function addProductToCart(quantity) {
    const cart = getCart();

    const existingProduct = cart.find(
      (item) => item.id === PRODUCT.id
    );

    if (existingProduct) {
      existingProduct.quantity = Math.min(
        10,
        Number(existingProduct.quantity || 0) + quantity
      );
    } else {
      cart.push({
        id: PRODUCT.id,
        name: PRODUCT.name,
        price: PRODUCT.price,
        image: PRODUCT.image,
        quantity,
      });
    }

    saveCart(cart);
  }

  function showNotification(quantity) {
    if (!cartNotification || !notificationMessage) {
      return;
    }

    notificationMessage.textContent =
      `${quantity} × Trio Classic has been added.`;

    cartNotification.classList.add('show');

    clearTimeout(notificationTimeout);

    notificationTimeout = setTimeout(() => {
      cartNotification.classList.remove('show');
    }, 3000);
  }

  decreaseButton?.addEventListener('click', () => {
    const currentQuantity = getQuantity();

    if (currentQuantity > 1) {
      quantityInput.value = String(currentQuantity - 1);
      updateTotal();
    }
  });

  increaseButton?.addEventListener('click', () => {
    const currentQuantity = getQuantity();

    if (currentQuantity < 10) {
      quantityInput.value = String(currentQuantity + 1);
      updateTotal();
    }
  });

  addCartButton?.addEventListener('click', () => {
    const quantity = getQuantity();

    addProductToCart(quantity);
    showNotification(quantity);
  });

  buyNowButton?.addEventListener('click', () => {
    const quantity = getQuantity();

    /*
     * Buy Now replaces the current basket with the selected
     * Trio product and sends the customer to checkout.
     */
    saveCart([
      {
        id: PRODUCT.id,
        name: PRODUCT.name,
        price: PRODUCT.price,
        image: PRODUCT.image,
        quantity,
      },
    ]);

    window.location.href = 'cart.html';
  });

  thumbnailButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const image = button.dataset.image;

      if (!image || !mainProductImage) {
        return;
      }

      mainProductImage.src = image;

      thumbnailButtons.forEach((thumbnail) => {
        thumbnail.classList.remove('active');
      });

      button.classList.add('active');
    });
  });

  mobileMenuButton?.addEventListener('click', () => {
    const isOpen = navigationLinks?.classList.toggle('open');

    mobileMenuButton.setAttribute(
      'aria-expanded',
      String(Boolean(isOpen))
    );
  });

  updateTotal();
  updateCartCount();
});