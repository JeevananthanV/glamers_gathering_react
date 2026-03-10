import type { Route } from "./+types/home";
import GlamourPage from "../components/GlamourPage";

export function meta({}: Route.MetaArgs) {
  return [
    {
      title:
        "Glamour Gatherings | Sustainable Fashion Event - Salem, April 2026",
    },
    {
      name: "description",
      content:
        "Glamour Gatherings - Salem's premier sustainable fashion and lifestyle event. Eco fashion walk, cultural performances, brand stalls, and more. April 2026, Tamil Nadu.",
    },
    {
      name: "keywords",
      content:
        "Sustainable Fashion, Eco Luxury, Glamour Gatherings, Fashion Show, Salem Event, Organic Lifestyle, Tamil Nadu Fashion 2026",
    },
    { name: "author", content: "Glamour Gatherings Team" },
    { name: "robots", content: "index, follow" },
    {
      property: "og:title",
      content: "Glamour Gatherings | Exclusive Sustainable Fashion Event 2026",
    },
    {
      property: "og:description",
      content:
        "Join Salem's most glamorous sustainable fashion event - April 2026. Models, eco brands, cultural performances and more.",
    },
    { property: "og:type", content: "website" },
    { name: "theme-color", content: "#501122" },
  ];
}

export default function Home() {
  return <GlamourPage />;
}
