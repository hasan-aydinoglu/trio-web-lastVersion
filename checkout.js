document.addEventListener("DOMContentLoaded", () => {
    const UNIT_PRICE = 499;
    const CURRENCY_SYMBOL = "₺";
  
    const CREATE_CHECKOUT_URL =
      "https://us-central1-trio-app-e3bea.cloudfunctions.net/createIyzicoCheckout";
  
    const checkoutForm =
      document.getElementById("checkoutForm");
  
    const paymentButton =
      document.getElementById("paymentButton");
  
    const cartCount =
      document.getElementById("cart-count");
  
    const summaryQuantity =
      document.getElementById("summaryQuantity");
  
    const summaryQuantityBadge =
      document.getElementById("summaryQuantityBadge");
  
    const summaryProductPrice =
      document.getElementById("summaryProductPrice");
  
    const summarySubtotal =
      document.getElementById("summarySubtotal");
  
    const summaryTotal =
      document.getElementById("summaryTotal");
  
    const agreement =
      document.getElementById("agreement");
  
    const agreementError =
      document.getElementById("agreementError");
  
    const mobileMenuButton =
      document.getElementById("mobileMenuButton");
  
    const navigationLinks =
      document.getElementById("navigationLinks");
  
    function formatPrice(price) {
      return `${CURRENCY_SYMBOL}${Number(price).toLocaleString("tr-TR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    }
  
    function getCart() {
      try {
        const savedCart =
          localStorage.getItem("trioCart");
  
        if (!savedCart) {
          return [];
        }
  
        const parsedCart =
          JSON.parse(savedCart);
  
        return Array.isArray(parsedCart)
          ? parsedCart
          : [];
      } catch (error) {
        console.error(
          "Cart could not be read:",
          error
        );
  
        return [];
      }
    }
  
    function getTrioItem() {
      const cart = getCart();
  
      return cart.find(
        (item) => item.name === "Trio Classic"
      );
    }
  
    function getQuantity() {
      const item = getTrioItem();
  
      if (!item) {
        return 1;
      }
  
      const quantity =
        Number.parseInt(item.quantity, 10);
  
      if (
        Number.isNaN(quantity) ||
        quantity < 1
      ) {
        return 1;
      }
  
      return Math.min(quantity, 10);
    }
  
    function updateOrderSummary() {
      const cart = getCart();
  
      const cartItemCount = cart.reduce(
        (total, item) => {
          return (
            total +
            (Number.parseInt(item.quantity, 10) || 0)
          );
        },
        0
      );
  
      const quantity = getQuantity();
      const subtotal = UNIT_PRICE * quantity;
  
      if (cartCount) {
        cartCount.textContent =
          cartItemCount > 0
            ? cartItemCount
            : quantity;
      }
  
      if (summaryQuantity) {
        summaryQuantity.textContent = quantity;
      }
  
      if (summaryQuantityBadge) {
        summaryQuantityBadge.textContent = quantity;
      }
  
      if (summaryProductPrice) {
        summaryProductPrice.textContent =
          formatPrice(subtotal);
      }
  
      if (summarySubtotal) {
        summarySubtotal.textContent =
          formatPrice(subtotal);
      }
  
      if (summaryTotal) {
        summaryTotal.textContent =
          formatPrice(subtotal);
      }
    }
  
    function showFieldError(field, message) {
      const formGroup =
        field.closest(".form-group");
  
      if (!formGroup) {
        return;
      }
  
      const errorMessage =
        formGroup.querySelector(".error-message");
  
      formGroup.classList.add("invalid");
  
      if (errorMessage) {
        errorMessage.textContent = message;
      }
    }
  
    function clearFieldError(field) {
      const formGroup =
        field.closest(".form-group");
  
      if (!formGroup) {
        return;
      }
  
      const errorMessage =
        formGroup.querySelector(".error-message");
  
      formGroup.classList.remove("invalid");
  
      if (errorMessage) {
        errorMessage.textContent = "";
      }
    }
  
    function validateEmail(email) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        email
      );
    }
  
    function validatePhone(phone) {
      const cleanedPhone =
        phone.replace(/[^\d+]/g, "");
  
      return cleanedPhone.length >= 10;
    }
  
    function validateField(field) {
      const value = field.value.trim();
  
      clearFieldError(field);
  
      if (
        field.hasAttribute("required") &&
        !value
      ) {
        showFieldError(
          field,
          "This field is required."
        );
  
        return false;
      }
  
      if (
        field.type === "email" &&
        value &&
        !validateEmail(value)
      ) {
        showFieldError(
          field,
          "Enter a valid email address."
        );
  
        return false;
      }
  
      if (
        field.id === "phone" &&
        value &&
        !validatePhone(value)
      ) {
        showFieldError(
          field,
          "Enter a valid phone number."
        );
  
        return false;
      }
  
      if (
        field.id === "postalCode" &&
        value &&
        value.length < 3
      ) {
        showFieldError(
          field,
          "Enter a valid postal code."
        );
  
        return false;
      }
  
      return true;
    }
  
    function validateForm() {
      const requiredFields =
        checkoutForm.querySelectorAll(
          'input[required]:not([type="checkbox"]), ' +
          "select[required], " +
          "textarea[required]"
        );
  
      let isValid = true;
  
      requiredFields.forEach((field) => {
        if (!validateField(field)) {
          isValid = false;
        }
      });
  
      if (agreementError) {
        agreementError.textContent = "";
      }
  
      if (
        agreement &&
        !agreement.checked
      ) {
        if (agreementError) {
          agreementError.textContent =
            "Please confirm your order information.";
        }
  
        isValid = false;
      }
  
      return isValid;
    }
  
    function getElementValue(id) {
      const element =
        document.getElementById(id);
  
      return element
        ? element.value.trim()
        : "";
    }
  
    function createOrderPayload() {
      const quantity = getQuantity();
      const subtotal = UNIT_PRICE * quantity;
  
      return {
        customer: {
          firstName:
            getElementValue("firstName"),
  
          lastName:
            getElementValue("lastName"),
  
          email:
            getElementValue("email"),
  
          phone:
            getElementValue("phone"),
        },
  
        deliveryAddress: {
          address:
            getElementValue("address"),
  
          country:
            getElementValue("country"),
  
          city:
            getElementValue("city"),
  
          district:
            getElementValue("district"),
  
          postalCode:
            getElementValue("postalCode"),
        },
  
        note:
          getElementValue("orderNote"),
  
        items: [
          {
            id: "TRIO-CLASSIC",
            name: "Trio Classic",
            category: "Board Game",
            quantity,
            unitPrice: UNIT_PRICE,
            totalPrice: subtotal,
            image: "trio-face.png",
          },
        ],
  
        currency: "TRY",
        subtotal,
        total: subtotal,
      };
    }
  
    function createFirebasePayload(orderPayload) {
      return {
        firstName:
          orderPayload.customer.firstName,
  
        lastName:
          orderPayload.customer.lastName,
  
        email:
          orderPayload.customer.email,
  
        phone:
          orderPayload.customer.phone,
  
        address:
          orderPayload.deliveryAddress.address,
  
        country:
          orderPayload.deliveryAddress.country,
  
        city:
          orderPayload.deliveryAddress.city,
  
        district:
          orderPayload.deliveryAddress.district,
  
        postalCode:
          orderPayload.deliveryAddress.postalCode,
  
        note:
          orderPayload.note,
  
        quantity:
          orderPayload.items[0].quantity,
      };
    }
  
    function setPaymentButtonLoading() {
      if (!paymentButton) {
        return;
      }
  
      paymentButton.disabled = true;
  
      paymentButton.innerHTML = `
        <span>Redirecting to secure payment...</span>
        <i class="fa-solid fa-spinner fa-spin"></i>
      `;
    }
  
    function resetPaymentButton() {
      if (!paymentButton) {
        return;
      }
  
      paymentButton.disabled = false;
  
      paymentButton.innerHTML = `
        <span>Continue to Secure Payment</span>
        <i class="fa-solid fa-arrow-right"></i>
      `;
    }
  
    async function startIyzicoPayment(
      orderPayload
    ) {
      const firebasePayload =
        createFirebasePayload(orderPayload);
  
      const response = await fetch(
        CREATE_CHECKOUT_URL,
        {
          method: "POST",
  
          headers: {
            "Content-Type": "application/json",
          },
  
          body:
            JSON.stringify(firebasePayload),
        }
      );
  
      let result;
  
      try {
        result = await response.json();
      } catch (error) {
        throw new Error(
          "The payment server returned an invalid response."
        );
      }
  
      if (
        !response.ok ||
        !result ||
        result.success !== true
      ) {
        throw new Error(
          result?.message ||
          "Payment could not be started."
        );
      }
  
      if (!result.paymentPageUrl) {
        throw new Error(
          "The secure payment page could not be created."
        );
      }
  
      localStorage.setItem(
        "trioPaymentOrderId",
        result.orderId || ""
      );
  
      window.location.href =
        result.paymentPageUrl;
    }
  
    if (checkoutForm) {
      checkoutForm.addEventListener(
        "submit",
        async (event) => {
          event.preventDefault();
  
          if (!validateForm()) {
            const firstInvalidField =
              checkoutForm.querySelector(
                ".form-group.invalid input, " +
                ".form-group.invalid select, " +
                ".form-group.invalid textarea"
              );
  
            if (firstInvalidField) {
              firstInvalidField.focus();
            }
  
            return;
          }
  
          const orderPayload =
            createOrderPayload();
  
          localStorage.setItem(
            "trioPendingOrder",
            JSON.stringify(orderPayload)
          );
  
          setPaymentButtonLoading();
  
          try {
            await startIyzicoPayment(
              orderPayload
            );
          } catch (error) {
            console.error(
              "iyzico payment error:",
              error
            );
  
            resetPaymentButton();
  
            alert(
              error.message ||
              "An error occurred while starting payment."
            );
          }
        }
      );
  
      checkoutForm
        .querySelectorAll(
          "input, select, textarea"
        )
        .forEach((field) => {
          field.addEventListener(
            "input",
            () => {
              if (
                field.type !== "checkbox"
              ) {
                validateField(field);
              }
            }
          );
  
          field.addEventListener(
            "change",
            () => {
              if (
                field.type !== "checkbox"
              ) {
                validateField(field);
              }
            }
          );
        });
    }
  
    if (agreement) {
      agreement.addEventListener(
        "change",
        () => {
          if (
            agreement.checked &&
            agreementError
          ) {
            agreementError.textContent = "";
          }
        }
      );
    }
  
    if (
      mobileMenuButton &&
      navigationLinks
    ) {
      const menuIcon =
        mobileMenuButton.querySelector("i");
  
      mobileMenuButton.addEventListener(
        "click",
        () => {
          const isActive =
            navigationLinks.classList.toggle(
              "active"
            );
  
          mobileMenuButton.setAttribute(
            "aria-expanded",
            String(isActive)
          );
  
          if (menuIcon) {
            menuIcon.classList.toggle(
              "fa-bars",
              !isActive
            );
  
            menuIcon.classList.toggle(
              "fa-xmark",
              isActive
            );
          }
        }
      );
  
      navigationLinks
        .querySelectorAll("a")
        .forEach((link) => {
          link.addEventListener(
            "click",
            () => {
              navigationLinks.classList.remove(
                "active"
              );
  
              mobileMenuButton.setAttribute(
                "aria-expanded",
                "false"
              );
  
              if (menuIcon) {
                menuIcon.classList.add(
                  "fa-bars"
                );
  
                menuIcon.classList.remove(
                  "fa-xmark"
                );
              }
            }
          );
        });
    }
  
    updateOrderSummary();
  });