import type { ComponentType, SVGProps } from "react";
import { ThumbsUp, Check, Eye, AlertTriangle, BedDouble, User, Activity, Heart, ShieldAlert, Star, Flame, Snowflake, Circle } from "lucide-react";

export type StatusIconKey =
  | "thumbs-up"
  | "check"
  | "eye"
  | "alert-triangle"
  | "bed-patient"
  | "activity"
  | "heart"
  | "shield-alert"
  | "star"
  | "flame"
  | "snowflake"
  | "circle"
  | "none";

type IconProps = SVGProps<SVGSVGElement> & { size?: number | string };

const BedPatientIcon: ComponentType<IconProps> = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    width={props.size ?? 16}
    height={props.size ?? 16}
    {...props}
  >
    {/* Patient head */}
    <circle cx="7.5" cy="7" r="2" />
    {/* Patient body lying on bed */}
    <path d="M9.5 11h6" />
    {/* Bed frame */}
    <path d="M2 13v7" />
    <path d="M22 17v3" />
    <path d="M2 17h20" />
    <path d="M2 13h11a4 4 0 0 1 4 4" />
  </svg>
);

export const STATUS_ICON_OPTIONS: { key: StatusIconKey; label: string; Icon: ComponentType<IconProps> }[] = [
  { key: "thumbs-up", label: "Thumbs Up", Icon: ThumbsUp },
  { key: "check", label: "Check", Icon: Check },
  { key: "eye", label: "Eye", Icon: Eye },
  { key: "alert-triangle", label: "Risk Triangle", Icon: AlertTriangle },
  { key: "bed-patient", label: "Bed with Patient", Icon: BedPatientIcon },
  { key: "activity", label: "Activity", Icon: Activity },
  { key: "heart", label: "Heart", Icon: Heart },
  { key: "shield-alert", label: "Shield Alert", Icon: ShieldAlert },
  { key: "star", label: "Star", Icon: Star },
  { key: "flame", label: "Flame", Icon: Flame },
  { key: "snowflake", label: "Snowflake", Icon: Snowflake },
  { key: "circle", label: "Circle", Icon: Circle },
  { key: "none", label: "None", Icon: (props) => <span {...(props as object)} /> },
];

const ICON_MAP = new Map<string, ComponentType<IconProps>>(STATUS_ICON_OPTIONS.map((option) => [option.key, option.Icon]));

export const VALID_STATUS_ICON_KEYS = new Set<string>(STATUS_ICON_OPTIONS.map((option) => option.key));

export const isValidStatusIconKey = (value: unknown): value is StatusIconKey =>
  typeof value === "string" && VALID_STATUS_ICON_KEYS.has(value);

export const getStatusIconComponent = (key: string | undefined | null): ComponentType<IconProps> | null => {
  if (!key || key === "none") return null;
  return ICON_MAP.get(key) ?? null;
};

export const getDefaultIconForLabel = (label: string, key?: string): StatusIconKey => {
  const normalized = (key ?? "").toLowerCase();
  const labelNormalized = label.trim().toLowerCase();
  if (normalized === "low" || labelNormalized === "low") return "thumbs-up";
  if (normalized === "optimal" || labelNormalized === "optimal") return "check";
  if (normalized === "watch" || labelNormalized === "watch") return "eye";
  if (normalized === "high" || labelNormalized === "high") return "alert-triangle";
  if (labelNormalized.includes("occupied") || labelNormalized.includes("patient") || labelNormalized.includes("bed")) return "bed-patient";
  return "circle";
};