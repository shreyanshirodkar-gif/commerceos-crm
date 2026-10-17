
import { jsPDF } from "jspdf";

const money = (value) =>
  `Rs. ${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const firstValue = (...values) =>
  values.find(
    (value) => value !== undefined && value !== null && value !== ""
  );

export function downloadPurchasePDF(order, address = {}, cart = []) {
  if (!order) {
    alert("Order details are not available. Please place your order again.");
    return;
  }

  const pdf = new jsPDF();
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 18;

  const orderNumber = firstValue(
    order.order_number,
    order.orderNumber,
    order.id,
    "N/A"
  );

  const orderDate = new Date(
    firstValue(order.order_date, order.created_at, Date.now())
  );

  const dateText = Number.isNaN(orderDate.getTime())
    ? new Date().toLocaleString("en-IN")
    : orderDate.toLocaleString("en-IN");

  const items = Array.isArray(cart) ? cart : [];
  let y = 20;
  let calculatedTotal = 0;

  // Header
  pdf.setFillColor(20, 45, 75);
  pdf.rect(0, 0, pageWidth, 38, "F");

  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(19);
  pdf.text("PURCHASE RECEIPT", margin, 17);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text("CommerceOS | Cash on Delivery", margin, 27);

  // Order information
  pdf.setTextColor(35, 35, 35);
  y = 49;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.text("Order Information", margin, y);
  y += 8;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);

  const orderInfo = [
    `Order Number: ${String(orderNumber)}`,
    `Order Date: ${dateText}`,
    `Payment Method: ${firstValue(order.payment_method, "Cash on Delivery")}`,
    `Order Status: ${firstValue(order.status, "Submitted")}`,
  ];

  for (const line of orderInfo) {
    pdf.text(line, margin, y);
    y += 6;
  }

  // Delivery information
  y += 7;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.text("Delivery Details", margin, y);
  y += 8;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);

  const deliveryDetails = [
    `Name: ${firstValue(address.shippingName, address.shipping_name, "N/A")}`,
    `Phone: ${firstValue(address.shippingPhone, address.shipping_phone, "N/A")}`,
    `Address: ${firstValue(address.shippingAddress, address.shipping_address, "N/A")}`,
    `City: ${firstValue(address.shippingCity, address.shipping_city, "N/A")}`,
    `State: ${firstValue(address.shippingState, address.shipping_state, "N/A")}`,
    `PIN Code: ${firstValue(address.shippingPostalCode, address.shipping_postal_code, "N/A")}`,
    `Country: ${firstValue(address.shippingCountry, address.shipping_country, "India")}`,
  ];

  for (const detail of deliveryDetails) {
    const lines = pdf.splitTextToSize(detail, pageWidth - margin * 2);

    if (y + lines.length * 5 > pageHeight - 25) {
      pdf.addPage();
      y = 20;
    }

    pdf.text(lines, margin, y);
    y += lines.length * 5 + 1;
  }

  // Product table
  y += 7;

  if (y > pageHeight - 50) {
    pdf.addPage();
    y = 20;
  }

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.text("Purchased Products", margin, y);
  y += 9;

  const col = {
    product: margin + 2,
    qty: pageWidth - 76,
    price: pageWidth - 53,
    amount: pageWidth - margin - 2,
  };

  const drawTableHeader = () => {
    pdf.setFillColor(235, 240, 246);
    pdf.rect(margin, y - 5, pageWidth - margin * 2, 10, "F");

    pdf.setTextColor(30, 30, 30);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);

    pdf.text("PRODUCT", col.product, y + 1);
    pdf.text("QTY", col.qty, y + 1);
    pdf.text("PRICE", col.price, y + 1);
    pdf.text("AMOUNT", col.amount, y + 1, { align: "right" });

    y += 11;
  };

  drawTableHeader();

  for (const item of items) {
    const productName = String(
      firstValue(item.name, item.title, item.product_name, "Product")
    );

    const quantity = Number(firstValue(item.quantity, 1));
    const price = Number(
      firstValue(
        item.price,
        item.sale_price,
        item.regular_price,
        item.unit_price,
        0
      )
    );

    const amount = quantity * price;
    calculatedTotal += amount;

    const productLines = pdf.splitTextToSize(productName, 72);
    const rowHeight = Math.max(9, productLines.length * 4.5 + 3);

    if (y + rowHeight > pageHeight - 35) {
      pdf.addPage();
      y = 20;
      drawTableHeader();
    }

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(35, 35, 35);

    pdf.text(productLines, col.product, y);
    pdf.text(String(quantity), col.qty, y);
    pdf.text(money(price), col.price, y);
    pdf.text(money(amount), col.amount, y, { align: "right" });

    y += rowHeight;

    pdf.setDrawColor(220, 220, 220);
    pdf.line(margin, y - 2, pageWidth - margin, y - 2);
  }

  // Total
  const backendTotal = firstValue(
    order.total,
    order.order_total,
    order.amount_total
  );

  const total =
    backendTotal !== undefined && Number.isFinite(Number(backendTotal))
      ? Number(backendTotal)
      : calculatedTotal;

  y += 8;

  if (y > pageHeight - 35) {
    pdf.addPage();
    y = 25;
  }

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.text("TOTAL", pageWidth - margin - 45, y);
  pdf.text(money(total), pageWidth - margin, y, { align: "right" });

  y += 10;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text("Payment is due upon delivery.", margin, y);
  y += 6;
  pdf.text("Please keep this receipt for your records.", margin, y);

  // Page footer
  const pageCount = pdf.internal.getNumberOfPages();

  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(110, 110, 110);

    pdf.text(
      `Order ${String(orderNumber)} | Page ${page} of ${pageCount}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: "center" }
    );
  }

  pdf.save(`Purchase-Receipt-${String(orderNumber)}.pdf`);
}
