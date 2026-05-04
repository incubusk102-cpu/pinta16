// Client-side A6 waybill generator.
//
// Generates an airway-bill style PDF that admins and customers can
// download from the order detail page / /account tracker. We use jspdf
// (text-only — no canvas image embedding) and JsBarcode rendered to an
// invisible canvas so the bundle stays small and there's no server cost.
//
// Layout: A6 portrait (105mm x 148mm). Fits the standard A6 thermal
// label sticker most PH couriers ask for.

import jsPDF from "jspdf";
import JsBarcode from "jsbarcode";
import type { CompletedOrder } from "@/contexts/CartContext";
import { findCourierById, findCourierTemplate } from "@/lib/shipment";

export interface WaybillSender {
  name: string;
  phone: string;
  address: string;
}

export interface WaybillOptions {
  sender?: WaybillSender;
  /** Force a "COD" badge instead of the auto-detected one. */
  paymentBadge?: "COD" | "PREPAID" | null;
  /** When true, skips opening the PDF in a new tab and returns it. */
  returnBlob?: boolean;
}

const DEFAULT_SENDER: WaybillSender = {
  name: "Pinta",
  phone: "+63 917 000 0000",
  address: "Pinta Studio, Manila, Philippines",
};

const A6_WIDTH = 105;
const A6_HEIGHT = 148;

const phpFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
});

const formatPhp = (n: number): string => phpFormatter.format(n);

// Render a CODE128 barcode to a data URL using JsBarcode + an offscreen
// canvas. Couriers consistently scan CODE128 so we don't need anything
// fancier (Code39 / DataMatrix etc.) for sortation.
const buildBarcodeDataUrl = (orderId: string): string | null => {
  if (typeof document === "undefined") return null;
  try {
    const canvas = document.createElement("canvas");
    JsBarcode(canvas, orderId, {
      format: "CODE128",
      width: 1.6,
      height: 50,
      displayValue: false,
      margin: 0,
      background: "#ffffff",
      lineColor: "#000000",
    });
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
};

const drawDashedDivider = (doc: jsPDF, y: number) => {
  // jsPDF v3 has setLineDashPattern; older versions silently no-op.
  // Either way the divider just becomes a solid line, which is fine.
  try {
    (
      doc as unknown as {
        setLineDashPattern?: (a: number[], b: number) => void;
      }
    ).setLineDashPattern?.([0.7, 0.7], 0);
  } catch {
    /* ignore — fallback is a solid line */
  }
  doc.setDrawColor(160, 160, 160);
  doc.setLineWidth(0.2);
  doc.line(6, y, A6_WIDTH - 6, y);
  try {
    (
      doc as unknown as {
        setLineDashPattern?: (a: number[], b: number) => void;
      }
    ).setLineDashPattern?.([], 0);
  } catch {
    /* ignore */
  }
};

const truncate = (s: string, max: number): string =>
  s.length > max ? `${s.slice(0, max - 1).trim()}\u2026` : s;

const formatAddressBlock = (order: CompletedOrder): string[] => {
  const i = order.orderInfo;
  const lines: string[] = [];
  if (i.fullName) lines.push(i.fullName);
  if (i.phone) lines.push(i.phone);
  const street = i.addressLine1 || i.address || "";
  if (street) lines.push(truncate(street, 60));
  const brgy = i.barangay ? `Brgy. ${i.barangay}` : "";
  if (brgy) lines.push(brgy);
  const cityProv = [i.city, i.province].filter(Boolean).join(", ");
  if (cityProv) lines.push(truncate(cityProv, 60));
  const regionPostal = [i.region, i.postalCode].filter(Boolean).join(" ");
  if (regionPostal) lines.push(regionPostal);
  if (i.landmark) lines.push(`Landmark: ${truncate(i.landmark, 50)}`);
  return lines;
};

const formatItemsBlock = (order: CompletedOrder): string[] => {
  // Cap to 6 rows so we don't overflow the A6 label. Anything more
  // collapses into a "+N more" trailer line.
  const MAX = 6;
  const lines: string[] = [];
  order.items.slice(0, MAX).forEach((item) => {
    const qty = `\u00d7${item.quantity}`;
    const title = truncate(item.title, 38);
    lines.push(`${qty}  ${title}`);
  });
  if (order.items.length > MAX) {
    lines.push(`+${order.items.length - MAX} more item(s)`);
  }
  return lines;
};

const courierLabel = (order: CompletedOrder): string => {
  const fromShipment = order.shipment?.courier;
  const fromInfo = order.orderInfo?.courier;
  const id = (fromShipment || fromInfo || "").trim();
  if (!id) return "Courier TBD";
  return findCourierById(id.toLowerCase())?.label || id;
};

const trackingDisplay = (order: CompletedOrder): string => {
  const tn = order.shipment?.trackingNumber || "";
  return tn ? truncate(tn, 28) : "(awaiting tracking)";
};

const detectPaymentBadge = (
  order: CompletedOrder,
): "COD" | "PREPAID" | null => {
  // PayMongo orders carry a paymentIntentId — treat those as PREPAID.
  // No intent + no review/voucher record? Default to COD because PH
  // couriers ask for one badge or the other on every label.
  if (order.paymentIntentId) return "PREPAID";
  return "COD";
};

const drawCenteredText = (
  doc: jsPDF,
  text: string,
  y: number,
  size = 9,
  bold = false,
) => {
  doc.setFont("helvetica", bold ? "bold" : "normal");
  doc.setFontSize(size);
  doc.text(text, A6_WIDTH / 2, y, { align: "center" });
};

export const buildWaybillPdf = (
  order: CompletedOrder,
  options: WaybillOptions = {},
): jsPDF => {
  const sender = options.sender || DEFAULT_SENDER;
  const doc = new jsPDF({ unit: "mm", format: [A6_WIDTH, A6_HEIGHT] });

  // ----- Header band: courier + payment badge -----
  doc.setFillColor(20, 20, 20);
  doc.rect(0, 0, A6_WIDTH, 14, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(courierLabel(order), 6, 9);
  const badge = options.paymentBadge ?? detectPaymentBadge(order);
  if (badge) {
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(A6_WIDTH - 26, 3, 20, 8, 1.5, 1.5, "F");
    doc.setTextColor(20, 20, 20);
    doc.setFontSize(9);
    doc.text(badge, A6_WIDTH - 16, 8.5, { align: "center" });
  }

  // ----- Barcode + order id -----
  doc.setTextColor(0, 0, 0);
  const barcode = buildBarcodeDataUrl(order.id);
  if (barcode) {
    doc.addImage(barcode, "PNG", 10, 17, A6_WIDTH - 20, 18);
  } else {
    drawCenteredText(doc, "[barcode unavailable]", 27, 8);
  }
  drawCenteredText(doc, order.id, 38, 11, true);

  drawDashedDivider(doc, 42);

  // ----- Recipient block -----
  let cursorY = 47;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("DELIVER TO", 6, cursorY);
  cursorY += 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  formatAddressBlock(order).forEach((line) => {
    doc.text(line, 6, cursorY);
    cursorY += 4;
  });
  cursorY += 1;
  drawDashedDivider(doc, cursorY);
  cursorY += 4;

  // ----- Sender block -----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("FROM", 6, cursorY);
  cursorY += 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(sender.name, 6, cursorY);
  cursorY += 3.5;
  if (sender.phone) {
    doc.text(sender.phone, 6, cursorY);
    cursorY += 3.5;
  }
  doc.text(truncate(sender.address, 60), 6, cursorY);
  cursorY += 4;
  drawDashedDivider(doc, cursorY);
  cursorY += 4;

  // ----- Items block -----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(`ITEMS (${order.items.length})`, 6, cursorY);
  cursorY += 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  formatItemsBlock(order).forEach((line) => {
    doc.text(line, 6, cursorY);
    cursorY += 3.6;
  });

  // ----- Declared value -----
  // Couriers (Lalamove especially) ask for a declared parcel value so
  // they can size their handling-care policy / insurance against it.
  // We declare the order subtotal (excludes shipping fee since the
  // rider gets paid in cash on delivery separately).
  const declaredValue = formatPhp(Number(order.subtotal) || 0);
  cursorY += 1;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("DECLARED VALUE", 6, cursorY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(declaredValue, A6_WIDTH - 6, cursorY, { align: "right" });

  // ----- Footer band: tracking + fragile stamp -----
  const footerY = A6_HEIGHT - 22;
  drawDashedDivider(doc, footerY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("TRACKING", 6, footerY + 4);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(trackingDisplay(order), 6, footerY + 8.5);

  const trackUrl =
    order.shipment?.trackingUrl ||
    (order.shipment?.trackingNumber ? buildTrackingHint(order) : undefined);
  if (trackUrl) {
    doc.setFontSize(7);
    doc.setTextColor(80, 80, 80);
    doc.text(truncate(trackUrl, 60), 6, footerY + 12);
    doc.setTextColor(0, 0, 0);
  }

  // Fragile stamp — bordered red box bottom-right of footer.
  doc.setDrawColor(180, 0, 0);
  doc.setLineWidth(0.6);
  doc.roundedRect(A6_WIDTH - 38, footerY + 1, 32, 16, 1.5, 1.5);
  doc.setTextColor(180, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("FRAGILE", A6_WIDTH - 22, footerY + 7, { align: "center" });
  doc.setFontSize(6);
  doc.setFont("helvetica", "normal");
  doc.text("Handle with care", A6_WIDTH - 22, footerY + 11.5, {
    align: "center",
  });
  doc.text("Painting / artwork", A6_WIDTH - 22, footerY + 14.5, {
    align: "center",
  });

  return doc;
};

const buildTrackingHint = (order: CompletedOrder): string | undefined => {
  const courier = order.shipment?.courier || order.orderInfo?.courier || "";
  const tn = order.shipment?.trackingNumber || "";
  if (!courier || !tn) return undefined;
  const tpl = findCourierTemplate(courier);
  if (!tpl) return undefined;
  return tpl.replace("{tn}", encodeURIComponent(tn));
};

// Convenience: trigger a download of `<orderId>-waybill.pdf` in the
// browser. Returns the jsPDF instance in case the caller wants to do
// extra work with it.
export const downloadWaybillPdf = (
  order: CompletedOrder,
  options: WaybillOptions = {},
): jsPDF => {
  const doc = buildWaybillPdf(order, options);
  doc.save(`${order.id}-waybill.pdf`);
  return doc;
};

// Build the waybill PDF and return its raw bytes encoded as a base64
// string (no `data:` prefix). Used by the order-confirmation flow to
// upload the PDF to the server so it can be attached to the customer
// confirmation email.
export const buildWaybillPdfBase64 = (
  order: CompletedOrder,
  options: WaybillOptions = {},
): string | null => {
  try {
    const doc = buildWaybillPdf(order, options);
    const buf = doc.output("arraybuffer") as ArrayBuffer;
    const bytes = new Uint8Array(buf);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(
        null,
        Array.from(bytes.subarray(i, i + chunk)),
      );
    }
    if (typeof btoa === "undefined") return null;
    return btoa(binary);
  } catch {
    return null;
  }
};
