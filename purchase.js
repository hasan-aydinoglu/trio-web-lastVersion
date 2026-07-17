document.addEventListener('DOMContentLoaded', () => {
    const PRODUCT = {
      name: 'Trio Classic',
      price: 15,
      image: 'trio-face.png',
    };
  
    const quantityInput =
      document.getElementById('quantity');
  
    const totalPrice =
      document.getElementById('totalPrice');
  
    const cartCount =
      document.getElementById('cart-count');
  
    const decreaseButton =
      document.getElementById('decreaseQuantity');
  
    const increaseButton =
      document.getElementById('increaseQuantity');
  
    const addCartButton =
      document.getElementById('addCartButton');
  
    const buyNowButton =
      document.getElementById('buyNowButton');
  
    const mainProductImage =
      document.getElementById('mainProductImage');
  
    const thumbnailButtons =
      document.querySelectorAll('.thumbnail-button');
  
    const cartNotification =
      document.getElementById('cartNotification');
  
    const notificationMessage =
      document.getElementById('notificationMessage');
  
    const mobileMenuButton =
      document.getElementById('mobileMenuButton');
  
    const navigationLinks =
      document.getElementById('navigationLinks');
  
    let notificationTimeout;
  
    function getCart() {
      try {
        const savedCart =
          localStorage.getItem('trioCart');
  
        if (!savedCart) {
          return [];
        }
  
        const parsedCart = JSON.parse(savedCart);
  
        return Array.isArray(parsedCart)
          ? parsedCart
          : [];
      } catch (error) {
        console.error('Cart could not be read:', error);
        return [];
      }
    }
  
    function saveCart(cart) {
      try {
        localStorage.setItem(
          'trioCart',
          JSON.stringify(cart)
        );
      } catch (error) {
        console.error('Cart could not be saved:', error);
      }
    }
  
    function getQuantity() {
      const quantity =
        Number.parseInt(quantityInput.value, 10);
  
      if (
        Number.isNaN(quantity) ||
        quantity < 1
      ) {
        return 1;
      }
  
      return Math.min(quantity, 10);
    }
  
    function updatePrice() {
      const quantity = getQuantity();
      const total = PRODUCT.price * quantity;
  
      quantityInput.value = quantity;
      totalPrice.textContent = total.toFixed(0);
    }
  
    function updateCartCount() {
      const cart = getCart();
  
      const totalItems = cart.reduce(
        (total, item) => {
          const quantity =
            Number.parseInt(item.quantity, 10) || 0;
  
          return total + quantity;
        },
        0
      );
  
      cartCount.textContent = totalItems;
    }
  
    function addProductToCart(redirectToCart = false) {
      const quantity = getQuantity();
      const cart = getCart();
  
      const existingProduct =
        cart.find(
          (item) => item.name === PRODUCT.name
        );
  
      if (existingProduct) {
        existingProduct.quantity =
          Math.min(
            (Number(existingProduct.quantity) || 0) +
              quantity,
            10
          );
      } else {
        cart.push({
          name: PRODUCT.name,
          price: PRODUCT.price,
          quantity,
          image: PRODUCT.image,
        });
      }
  
      saveCart(cart);
      updateCartCount();
  
      if (redirectToCart) {
        window.location.href = 'checkout.html';
        return;
      }
  
      showNotification(quantity);
    }
  
    function showNotification(quantity) {
      notificationMessage.textContent =
        `${quantity} × Trio Classic added to your cart.`;
  
      cartNotification.classList.add('show');
  
      window.clearTimeout(notificationTimeout);
  
      notificationTimeout = window.setTimeout(
        () => {
          cartNotification.classList.remove('show');
        },
        3000
      );
    }
  
    decreaseButton.addEventListener(
      'click',
      () => {
        const currentQuantity = getQuantity();
  
        if (currentQuantity > 1) {
          quantityInput.value =
            currentQuantity - 1;
  
          updatePrice();
        }
      }
    );
  
    increaseButton.addEventListener(
      'click',
      () => {
        const currentQuantity = getQuantity();
  
        if (currentQuantity < 10) {
          quantityInput.value =
            currentQuantity + 1;
  
          updatePrice();
        }
      }
    );
  
    addCartButton.addEventListener(
      'click',
      () => {
        addProductToCart(false);
      }
    );
  
    buyNowButton.addEventListener(
      'click',
      () => {
        addProductToCart(true);
      }
    );
  
    thumbnailButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const selectedImage =
          button.dataset.image;
  
        if (!selectedImage) {
          return;
        }
  
        thumbnailButtons.forEach(
          (thumbnail) => {
            thumbnail.classList.remove('active');
          }
        );
  
        button.classList.add('active');
  
        mainProductImage.style.opacity = '0';
        mainProductImage.style.transform =
          'scale(0.96)';
  
        window.setTimeout(() => {
          mainProductImage.src = selectedImage;
          mainProductImage.style.opacity = '1';
          mainProductImage.style.transform =
            'scale(1)';
        }, 180);
      });
    });
  
    if (
      mobileMenuButton &&
      navigationLinks
    ) {
      const menuIcon =
        mobileMenuButton.querySelector('i');
  
      mobileMenuButton.addEventListener(
        'click',
        () => {
          const isActive =
            navigationLinks.classList.toggle(
              'active'
            );
  
          mobileMenuButton.setAttribute(
            'aria-expanded',
            String(isActive)
          );
  
          if (menuIcon) {
            menuIcon.classList.toggle(
              'fa-bars',
              !isActive
            );
  
            menuIcon.classList.toggle(
              'fa-xmark',
              isActive
            );
          }
        }
      );
  
      navigationLinks
        .querySelectorAll('a')
        .forEach((link) => {
          link.addEventListener('click', () => {
            navigationLinks.classList.remove(
              'active'
            );
  
            mobileMenuButton.setAttribute(
              'aria-expanded',
              'false'
            );
  
            if (menuIcon) {
              menuIcon.classList.add('fa-bars');
              menuIcon.classList.remove(
                'fa-xmark'
              );
            }
          });
        });
    }
  
    updatePrice();
    updateCartCount();
  });