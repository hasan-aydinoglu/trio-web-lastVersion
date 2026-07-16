function loadCart() {
    const cart = JSON.parse(localStorage.getItem('cart')) || [];
    const cartItemsDiv = document.getElementById('cart-items');
    const totalDiv = document.getElementById('total');
  
    cartItemsDiv.innerHTML = '';
    let total = 0;
  
    cart.forEach(item => {
      const itemDiv = document.createElement('div');
      itemDiv.classList.add('cart-item');
      itemDiv.textContent = `${item.name} - £${item.price}`;
      cartItemsDiv.appendChild(itemDiv);
      total += item.price;
    });
  
    totalDiv.innerHTML = `<strong>Total:</strong> £${total}`;
  }
  
  function confirmOrder() {
    alert('Thank you for your order!');
    localStorage.removeItem('cart');
    window.location.href = 'purchase.html';
  }
  
  window.onload = loadCart;
  