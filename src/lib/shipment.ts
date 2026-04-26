export interface CourierOption {
  id: string;
  label: string;
  trackingTemplate?: string;
}

export const COURIERS: CourierOption[] = [
  {
    id: "j&t",
    label: "J&T Express",
    trackingTemplate:
      "https://www.jtexpress.ph/index/query/gzquery.html?bills={tn}",
  },
  {
    id: "jrs",
    label: "JRS Express",
    trackingTemplate: "https://www.jrs-express.com/tracking/?tracking_no={tn}",
  },
  {
    id: "lbc",
    label: "LBC Express",
    trackingTemplate: "https://www.lbcexpress.com/track/?tn={tn}",
  },
  {
    id: "ninjavan",
    label: "Ninja Van",
    trackingTemplate: "https://www.ninjavan.co/en-ph/tracking?tracking_id={tn}",
  },
  {
    id: "flash",
    label: "Flash Express",
    trackingTemplate: "https://www.flashexpress.com.ph/tracking?tracking={tn}",
  },
  { id: "lalamove", label: "Lalamove" },
  { id: "grab", label: "Grab Express" },
  { id: "other", label: "Other / Self-pickup" },
];

export const findCourierTemplate = (courier: string): string | undefined => {
  if (!courier) return undefined;
  const norm = courier.trim().toLowerCase();
  const direct = COURIERS.find((c) => c.id === norm);
  if (direct?.trackingTemplate) return direct.trackingTemplate;
  const match = COURIERS.find(
    (c) =>
      c.label.toLowerCase() === norm || c.label.toLowerCase().includes(norm),
  );
  return match?.trackingTemplate;
};

export const buildTrackingUrl = (
  courier: string,
  trackingNumber: string,
  override?: string,
): string | undefined => {
  if (override && /^https?:\/\//i.test(override)) return override;
  if (!trackingNumber) return undefined;
  const tpl = findCourierTemplate(courier);
  if (!tpl) return undefined;
  return tpl.replace("{tn}", encodeURIComponent(trackingNumber));
};
