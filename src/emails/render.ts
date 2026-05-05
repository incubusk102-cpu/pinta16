/**
 * Server-side render entry points for the React Email templates.
 *
 * Each `render*` function returns `{ subject, html, text }` so the
 * functions/api/_lib/email.js wrapper can drop the result straight into
 * the existing sendEmail() transport. Plaintext fallback is generated
 * by the per-template `build*Meta` helpers so we don't ship a hidden
 * blank text body.
 *
 * Runtime: this module is imported from Cloudflare Pages Functions
 * (via functions/api/_lib/email.js) and runs inside the Workers
 * isolate. `@react-email/render` resolves to its `workerd` export
 * condition (dist/edge/index.mjs) which uses WritableStream rather
 * than node:stream — verified compatible with Pages Functions.
 */

import * as React from "react";
import { render } from "@react-email/render";
import OrderEmail, {
  buildOrderEmailMeta,
  type OrderEmailProps,
} from "./templates/OrderEmail";
import WelcomeEmail, {
  buildWelcomeEmailMeta,
  type WelcomeEmailProps,
} from "./templates/WelcomeEmail";
import NewOrderAdminAlert, {
  buildNewOrderAdminAlertMeta,
  type NewOrderAdminAlertProps,
} from "./templates/NewOrderAdminAlert";
import VoucherEmail, {
  buildVoucherEmailMeta,
  type VoucherEmailProps,
} from "./templates/VoucherEmail";
import InactiveDeletionEmail, {
  buildInactiveDeletionEmailMeta,
  type InactiveDeletionEmailProps,
} from "./templates/InactiveDeletionEmail";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const renderHtml = async (element: React.ReactElement): Promise<string> => {
  // pretty:false trims whitespace; better deliverability + smaller payload.
  return await render(element, { pretty: false });
};

export const renderOrderEmail = async (
  props: OrderEmailProps,
): Promise<RenderedEmail> => {
  const meta = buildOrderEmailMeta(props);
  const html = await renderHtml(React.createElement(OrderEmail, props));
  return { subject: meta.subject, html, text: meta.text };
};

export const renderWelcomeEmail = async (
  props: WelcomeEmailProps,
): Promise<RenderedEmail> => {
  const meta = buildWelcomeEmailMeta(props);
  const html = await renderHtml(React.createElement(WelcomeEmail, props));
  return { subject: meta.subject, html, text: meta.text };
};

export const renderNewOrderAdminAlert = async (
  props: NewOrderAdminAlertProps,
): Promise<RenderedEmail> => {
  const meta = buildNewOrderAdminAlertMeta(props);
  const html = await renderHtml(React.createElement(NewOrderAdminAlert, props));
  return { subject: meta.subject, html, text: meta.text };
};

export const renderVoucherEmail = async (
  props: VoucherEmailProps,
): Promise<RenderedEmail> => {
  const meta = buildVoucherEmailMeta(props);
  const html = await renderHtml(React.createElement(VoucherEmail, props));
  return { subject: meta.subject, html, text: meta.text };
};

export const renderInactiveDeletionEmail = async (
  props: InactiveDeletionEmailProps,
): Promise<RenderedEmail> => {
  const meta = buildInactiveDeletionEmailMeta(props);
  const html = await renderHtml(
    React.createElement(InactiveDeletionEmail, props),
  );
  return { subject: meta.subject, html, text: meta.text };
};

// Re-export templates for the local design preview server.
export { default as OrderEmail } from "./templates/OrderEmail";
export { default as WelcomeEmail } from "./templates/WelcomeEmail";
export { default as NewOrderAdminAlert } from "./templates/NewOrderAdminAlert";
export { default as VoucherEmail } from "./templates/VoucherEmail";
export { default as InactiveDeletionEmail } from "./templates/InactiveDeletionEmail";
