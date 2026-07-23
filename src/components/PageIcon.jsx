import React from "react";

// Une icône de page peut être un emoji (texte) ou une image importée (data URL).
export function isImageIcon(icon) {
  return typeof icon === "string" && /^(data:|https?:|blob:)/.test(icon);
}

// Rend l'icône à la taille demandée : <img> pour une image, sinon l'emoji.
export default function PageIcon({ icon, size = 16, className = "" }) {
  if (!icon) return null;
  if (isImageIcon(icon)) {
    return (
      <img
        src={icon}
        alt=""
        draggable={false}
        style={{ width: size, height: size, objectFit: "cover" }}
        className={`inline-block shrink-0 rounded-md object-cover align-middle ${className}`}
      />
    );
  }
  return (
    <span
      className={`inline-flex items-center justify-center leading-none ${className}`}
      style={{ fontSize: size }}
    >
      {icon}
    </span>
  );
}
