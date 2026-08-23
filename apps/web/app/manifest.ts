import type { MetadataRoute } from "next";

/**
 * Web app manifest.
 *
 * Studio is a full-screen tool people keep open, so it is worth being
 * installable: on a shop-floor tablet an installed LADX opens without browser
 * chrome eating a third of a ladder diagram.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LADX: AI workbench for automation engineers",
    short_name: "LADX",
    description:
      "Draw ladder logic and watch it run, generate validated PLC code, and convert between platforms.",
    start_url: "/",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: "#0F1A24",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
