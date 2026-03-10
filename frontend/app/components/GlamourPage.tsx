import { useEffect, useState, type FormEvent, type MouseEvent as ReactMouseEvent } from "react";
import QRCode from "qrcode";

const EVENT_DATE_ISO = "2026-04-02T09:00:00";
const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:5000";
const DEFAULT_REMAINING = {
  audience: 250,
  models: 60,
  "makeup-artists": 30,
  "stall-owners": 90,
};

type AudienceTicket = {
  id?: number;
  code: string;
  fullName: string;
  tickets: number;
  createdAt: string;
};

function useGlamourInteractions() {
  useEffect(() => {
    const qs = (s: string, root: Document | Element = document) =>
      root.querySelector(s);
    const qsa = (s: string, root: Document | Element = document) =>
      Array.from(root.querySelectorAll(s));

    const cleanups: Array<() => void> = [];

    const initPreloader = () => {
      const preloader = qs("#gg-preloader") as HTMLElement | null;
      if (!preloader) return;

      const onLoad = () => {
        window.setTimeout(() => {
          preloader.style.opacity = "0";
          window.setTimeout(() => {
            preloader.style.display = "none";
          }, 700);
        }, 700);
      };

      if (document.readyState === "complete") {
        onLoad();
      } else {
        window.addEventListener("load", onLoad);
        cleanups.push(() => window.removeEventListener("load", onLoad));
      }
    };

    const initMobileNav = () => {
      const navToggle = qs(".gg-mobile-toggle") as HTMLButtonElement | null;
      const navMenu = qs(".gg-nav-menu") as HTMLElement | null;
      if (!navToggle || !navMenu) return;

      const onToggle = () => {
        const isOpen = navMenu.classList.toggle("active");
        navToggle.innerHTML = isOpen
          ? '<i class="fas fa-times" aria-hidden="true"></i>'
          : '<i class="fas fa-bars" aria-hidden="true"></i>';
        navToggle.setAttribute("aria-expanded", String(isOpen));
      };

      navToggle.addEventListener("click", onToggle);
      cleanups.push(() => navToggle.removeEventListener("click", onToggle));

      const linkHandlers: Array<{ el: Element; fn: () => void }> = [];
      qsa("a", navMenu).forEach((link) => {
        const fn = () => {
          navMenu.classList.remove("active");
          navToggle.innerHTML =
            '<i class="fas fa-bars" aria-hidden="true"></i>';
          navToggle.setAttribute("aria-expanded", "false");
        };
        link.addEventListener("click", fn);
        linkHandlers.push({ el: link, fn });
      });

      cleanups.push(() => {
        linkHandlers.forEach(({ el, fn }) =>
          el.removeEventListener("click", fn)
        );
      });
    };

    const initNavScroll = () => {
      const nav = qs(".gg-nav") as HTMLElement | null;
      const scrollTopBtn = qs("#scrollTop") as HTMLButtonElement | null;

      const onScroll = () => {
        const y = window.scrollY;
        if (nav) nav.classList.toggle("scrolled", y > 50);
        if (scrollTopBtn) scrollTopBtn.classList.toggle("visible", y > 400);
      };

      window.addEventListener("scroll", onScroll, { passive: true });
      cleanups.push(() => window.removeEventListener("scroll", onScroll));

      if (scrollTopBtn) {
        const onClick = () => {
          window.scrollTo({ top: 0, behavior: "smooth" });
        };
        scrollTopBtn.addEventListener("click", onClick);
        cleanups.push(() => scrollTopBtn.removeEventListener("click", onClick));
      }
    };

    const initHeroSlider = () => {
      const slider = qs(".gg-hero-slider") as HTMLElement | null;
      if (!slider) return;

      const slides = qsa(".gg-slide", slider) as HTMLElement[];
      const dotsContainer = qs(".gg-slider-dots", slider) as HTMLElement | null;
      const prevBtn =
        (qs("#prev-slide", slider) as HTMLButtonElement | null) ||
        (qs("#prev-slide") as HTMLButtonElement | null);
      const nextBtn =
        (qs("#next-slide", slider) as HTMLButtonElement | null) ||
        (qs("#next-slide") as HTMLButtonElement | null);

      if (!slides.length) return;

      let current = Math.max(
        0,
        slides.findIndex((s) => s.classList.contains("active"))
      );

      let autoTimer: number | null = null;
      const intervalMs = 3500;
      const hasArrowControls = !!(prevBtn && nextBtn);
      const dots: HTMLButtonElement[] = [];

      if (dotsContainer) {
        dotsContainer.innerHTML = "";
        slides.forEach((_, i) => {
          const dot = document.createElement("button");
          dot.className = "gg-dot";
          dot.type = "button";
          dot.dataset.index = String(i);
          dot.setAttribute("role", "tab");
          dot.setAttribute("aria-label", `Slide ${i + 1}`);
          dot.setAttribute("aria-selected", i === current ? "true" : "false");
          if (i === current) dot.classList.add("active");
          dotsContainer.appendChild(dot);
          dots.push(dot);
        });
      }
      const hasDots = dots.length > 0;

      const paint = () => {
        slides.forEach((slide, i) => {
          const active = i === current;
          slide.classList.toggle("active", active);
          slide.setAttribute("aria-hidden", String(!active));
        });

        if (hasDots) {
          dots.forEach((dot, i) => {
            const active = i === current;
            dot.classList.toggle("active", active);
            dot.setAttribute("aria-selected", String(active));
          });
        }
      };

      const showSlide = (idx: number) => {
        current = ((idx % slides.length) + slides.length) % slides.length;
        paint();
      };

      const startAuto = () => {
        stopAuto();
        autoTimer = window.setInterval(() => {
          showSlide(current + 1);
        }, intervalMs);
      };

      const stopAuto = () => {
        if (autoTimer) {
          clearInterval(autoTimer);
          autoTimer = null;
        }
      };

      const resetAuto = () => {
        startAuto();
      };

      if (hasArrowControls && prevBtn && nextBtn) {
        const onNext = () => {
          showSlide(current + 1);
          resetAuto();
        };
        const onPrev = () => {
          showSlide(current - 1);
          resetAuto();
        };
        nextBtn.addEventListener("click", onNext);
        prevBtn.addEventListener("click", onPrev);
        cleanups.push(() => {
          nextBtn.removeEventListener("click", onNext);
          prevBtn.removeEventListener("click", onPrev);
        });
      }

      if (hasDots) {
        const dotHandlers: Array<{ el: HTMLButtonElement; fn: () => void }> =
          [];
        dots.forEach((dot) => {
          const fn = () => {
            const idx = Number(dot.dataset.index);
            if (Number.isNaN(idx)) return;
            showSlide(idx);
            resetAuto();
          };
          dot.addEventListener("click", fn);
          dotHandlers.push({ el: dot, fn });
        });
        cleanups.push(() => {
          dotHandlers.forEach(({ el, fn }) =>
            el.removeEventListener("click", fn)
          );
        });
      }

      if (hasArrowControls || hasDots) {
        const onKey = (e: KeyboardEvent) => {
          if (e.key === "ArrowRight") {
            showSlide(current + 1);
            resetAuto();
          }
          if (e.key === "ArrowLeft") {
            showSlide(current - 1);
            resetAuto();
          }
        };
        window.addEventListener("keydown", onKey);
        cleanups.push(() => window.removeEventListener("keydown", onKey));
      }

      paint();
      startAuto();
      cleanups.push(() => stopAuto());
    };

    const initCountdown = () => {
      const dayEl = qs("#days") as HTMLElement | null;
      const hourEl = qs("#hours") as HTMLElement | null;
      const minuteEl = qs("#minutes") as HTMLElement | null;
      const secondEl = qs("#seconds") as HTMLElement | null;
      if (!dayEl || !hourEl || !minuteEl || !secondEl) return;

      const target = new Date(EVENT_DATE_ISO);
      const pad = (n: number) => String(n).padStart(2, "0");

      const tick = () => {
        const diff = target.getTime() - Date.now();
        if (diff <= 0) {
          dayEl.textContent = "00";
          hourEl.textContent = "00";
          minuteEl.textContent = "00";
          secondEl.textContent = "00";
          return;
        }

        dayEl.textContent = pad(Math.floor(diff / 86400000));
        hourEl.textContent = pad(Math.floor((diff % 86400000) / 3600000));
        minuteEl.textContent = pad(Math.floor((diff % 3600000) / 60000));
        secondEl.textContent = pad(Math.floor((diff % 60000) / 1000));
      };

      tick();
      const timer = window.setInterval(tick, 1000);
      cleanups.push(() => window.clearInterval(timer));
    };

    const initDialogs = () => {
      const handlers: Array<{
        el: HTMLDialogElement;
        fn: (e: MouseEvent) => void;
      }> = [];
      qsa("dialog").forEach((el) => {
        if (!(el instanceof HTMLDialogElement)) return;
        const fn = (e: MouseEvent) => {
          if (e.target === el) el.close();
        };
        el.addEventListener("click", fn);
        handlers.push({ el, fn });
      });
      cleanups.push(() => {
        handlers.forEach(({ el, fn }) => el.removeEventListener("click", fn));
      });
    };

    const initReveal = () => {
      const revealEls = qsa(".gg-reveal, .gg-reveal-stagger");
      if (!revealEls.length) return;

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("active");
              observer.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.12 }
      );

      revealEls.forEach((el) => observer.observe(el));
      cleanups.push(() => observer.disconnect());
    };

    const initSmoothScroll = () => {
      const handlers: Array<{
        el: HTMLAnchorElement;
        fn: (e: Event) => void;
      }> = [];
      qsa('a[href^="#"]').forEach((anchor) => {
        if (!(anchor instanceof HTMLAnchorElement)) return;
        const fn = (e: Event) => {
          const href = anchor.getAttribute("href");
          if (!href || href === "#") return;

          const target = qs(href);
          if (!target) return;

          e.preventDefault();
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        };
        anchor.addEventListener("click", fn);
        handlers.push({ el: anchor, fn });
      });
      cleanups.push(() => {
        handlers.forEach(({ el, fn }) => el.removeEventListener("click", fn));
      });
    };

    initPreloader();
    initMobileNav();
    initNavScroll();
    initHeroSlider();
    initCountdown();
    initDialogs();
    initReveal();
    initSmoothScroll();

    return () => {
      cleanups.forEach((fn) => fn());
    };
  }, []);
}

function showToast(message: string) {
  const toast = document.createElement("div");
  toast.textContent = message || "Submitted";
  Object.assign(toast.style, {
    position: "fixed",
    bottom: "2rem",
    left: "50%",
    transform: "translateX(-50%) translateY(20px)",
    background: "linear-gradient(135deg,#501122,#004a41)",
    color: "#fffef7",
    padding: "1rem 2rem",
    borderRadius: "50px",
    fontSize: "0.88rem",
    letterSpacing: "1px",
    zIndex: "9998",
    boxShadow: "0 8px 30px rgba(0,0,0,0.5)",
    opacity: "0",
    transition: "all 0.4s ease",
    fontFamily: "'Jost', sans-serif",
  });
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateX(-50%) translateY(0)";
  });

  window.setTimeout(() => {
    toast.style.opacity = "0";
    window.setTimeout(() => toast.remove(), 400);
  }, 2500);
}

async function downloadAudienceTicket(ticket: AudienceTicket) {
  const canvas = document.createElement("canvas");
  const width = 1200;
  const height = 700;
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#501122");
  gradient.addColorStop(0.5, "#0e2f2c");
  gradient.addColorStop(1, "#0a1614");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
  ctx.fillRect(40, 40, width - 80, height - 80);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
  ctx.lineWidth = 2;
  ctx.strokeRect(40, 40, width - 80, height - 80);

  ctx.fillStyle = "#fff3e5";
  ctx.font = "600 42px 'Jost', 'Segoe UI', sans-serif";
  ctx.fillText("Glamour Gatherings", 90, 120);

  ctx.font = "20px 'Jost', 'Segoe UI', sans-serif";
  ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
  ctx.fillText("Audience Entry Ticket", 92, 155);

  ctx.fillStyle = "#ffffff";
  ctx.font = "28px 'Jost', 'Segoe UI', sans-serif";
  ctx.fillText(`Name: ${ticket.fullName}`, 90, 230);
  ctx.fillText(`Tickets: ${ticket.tickets}`, 90, 275);

  const date = new Date(ticket.createdAt);
  const dateText = Number.isNaN(date.getTime())
    ? ticket.createdAt
    : date.toLocaleString();
  ctx.fillText(`Booked At: ${dateText}`, 90, 320);

  ctx.font = "22px 'Jost', 'Segoe UI', sans-serif";
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.fillText("Event Date: 02 Apr 2026", 90, 380);
  ctx.fillText("Venue: Salem, Tamil Nadu", 90, 415);

  const qrPayload = JSON.stringify({
    code: ticket.code,
    name: ticket.fullName,
    tickets: ticket.tickets,
    bookedAt: ticket.createdAt,
  });
  let qrUrl = "";
  try {
    qrUrl = await QRCode.toDataURL(qrPayload, {
      width: 260,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#0b1c19", light: "#ffffff" },
    });
  } catch {
    qrUrl = "";
  }

  const qrX = width - 360;
  const qrY = 190;
  if (qrUrl) {
    const qrImg = new Image();
    qrImg.src = qrUrl;
    await new Promise((resolve) => {
      qrImg.onload = resolve;
      qrImg.onerror = resolve;
    });
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(qrX - 10, qrY - 10, 280, 280);
    ctx.drawImage(qrImg, qrX, qrY, 260, 260);
  }

  ctx.fillStyle = "#fff3e5";
  ctx.font = "18px 'Jost', 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`ID: ${ticket.code}`, qrX + 120, qrY + 300);
  ctx.fillText(ticket.fullName, qrX + 120, qrY + 330);
  ctx.textAlign = "left";

  const dataUrl = canvas.toDataURL("image/png");
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = `GG-Ticket-${ticket.code}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export default function GlamourPage() {
  useGlamourInteractions();
  const [remaining, setRemaining] = useState(DEFAULT_REMAINING);

  const openDialog =
    (id: string) =>
    (e: ReactMouseEvent<Element>) => {
      e.preventDefault();
      const dialog = document.getElementById(id);
      if (dialog instanceof HTMLDialogElement) {
        dialog.showModal();
      }
    };

  const handleDialogSubmit =
    (endpoint: string, message: string) =>
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const form = e.currentTarget;
      const dialog = form.closest("dialog");

      const payload = Object.fromEntries(new FormData(form).entries());
      delete (payload as Record<string, unknown>).agreement;

      if ("tickets" in payload) {
        (payload as Record<string, unknown>).tickets = Number(payload.tickets);
      }
      if ("age" in payload) {
        (payload as Record<string, unknown>).age = Number(payload.age);
      }
      if ("experience" in payload) {
        (payload as Record<string, unknown>).experience = Number(
          payload.experience
        );
      }

      try {
        const res = await fetch(`${API_BASE}/api/submissions/${endpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const error =
            (await res.json().catch(() => null))?.error ||
            "Submission failed";
          throw new Error(error);
        }

        const responsePayload = await res.json().catch(() => ({}));
        form.reset();
        if (dialog instanceof HTMLDialogElement) dialog.close();
        showToast(message);
        if (endpoint === "audience" && responsePayload?.ticket?.code) {
          await downloadAudienceTicket(responsePayload.ticket as AudienceTicket);
        }
        void refreshRemaining();
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Submission failed");
      }
    };

  const refreshRemaining = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/public/remaining`);
      if (!res.ok) return;
      const payload = (await res.json()) as {
        remaining?: typeof DEFAULT_REMAINING;
      };
      if (payload?.remaining) setRemaining(payload.remaining);
    } catch {
      // Ignore fetch errors and keep defaults
    }
  };

  useEffect(() => {
    void refreshRemaining();
  }, []);

  return (
    <>
      <Preloader />
      <NavBar />
      <HeroSlider />
      <main id="main-content">
        <AboutSection />
        <ParticipationSection onOpenDialog={openDialog} remaining={remaining} />
        <SponsorsMarquee />
        <ModelsSection />
        <MakeupArtistsSection />
        <ScheduleSection />
        <VenueSection />
        <CtaSection />
      </main>
      <Footer onOpenDialog={openDialog} />
      <ScrollTopButton />
      <Modals onSubmit={handleDialogSubmit} />
    </>
  );
}

function Preloader() {
  return (
    <div id="gg-preloader" role="status" aria-label="Loading Glamour Gatherings">
      <div className="gg-loader-logo">Glamour Gatherings</div>
      <div className="gg-loader-sub">Salem - April 2026</div>
      <div className="gg-loader-bar" aria-hidden="true"></div>
    </div>
  );
}

function NavBar() {
  return (
    <nav className="gg-nav" role="navigation" aria-label="Main navigation">
      <div className="brand-mark-logo">
        <img src="/assets/images/gg logo.svg" alt="Glamour Gatherings Logo" />
      </div>
      <button
        className="gg-mobile-toggle"
        aria-label="Toggle mobile navigation"
        aria-expanded="false"
        type="button"
      >
        <i className="fas fa-bars" aria-hidden="true"></i>
      </button>
      <ul className="gg-nav-menu" role="list">
        <li>
          <a href="#home" className="gg-nav-link">
            Home
          </a>
        </li>
        <li>
          <a href="#about" className="gg-nav-link">
            About
          </a>
        </li>
        <li>
          <a href="#schedule" className="gg-nav-link">
            Schedule
          </a>
        </li>
        <li>
          <a href="#participate" className="gg-nav-link">
            Participate
          </a>
        </li>
        <li>
          <a href="#models" className="gg-nav-link">
            Models
          </a>
        </li>
        <li>
          <a href="#contact" className="gg-nav-link">
            Contact
          </a>
        </li>
      </ul>
      <a href="#participate" className="gg-btn gg-nav-cta">
        Register Now
      </a>
    </nav>
  );
}

function HeroSlider() {
  return (
    <header id="home" className="gg-hero-slider" aria-label="Event hero banner">
      <div
        className="gg-slide active"
        style={{
          backgroundImage: "url('/assets/images/img/hero/banner.png')",
        }}
        role="img"
        aria-label="Glamour Gatherings event banner"
      >
        <div className="gg-slide-overlay" aria-hidden="true"></div>
        <div className="gg-slide-content">
          <span className="gg-hero-eyebrow">Salem, Tamil Nadu - April 2026</span>
          <h1 className="gg-hero-title">Welcome to Glamour Gatherings</h1>
          <p className="gg-hero-tagline">
            Your exclusive sanctuary for sustainable fashion, elegance, and
            cultural richness.
          </p>
          <div className="gg-event-meta-box" role="list" aria-label="Event key details">
            <div className="gg-meta-item" role="listitem">
              <h3>02</h3>
              <p>Apr 2026</p>
            </div>
            <div className="gg-meta-item" role="listitem">
              <h3>Salem</h3>
              <p>Tamil Nadu</p>
            </div>
            <div className="gg-meta-item" role="listitem">
              <h3>1 Day</h3>
              <p>Full Event</p>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              gap: "1rem",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <a href="#participate" className="gg-btn">
              Book Tickets
            </a>
            <a href="#schedule" className="gg-btn-outline">
              View Schedule
            </a>
          </div>
        </div>
      </div>

      <div
        className="gg-slide"
        style={{
          backgroundImage: "url('/assets/images/img/hero/glamour-hero.jpg')",
        }}
        role="img"
        aria-label="Countdown to event"
      >
        <div className="gg-slide-overlay" aria-hidden="true"></div>
        <div className="gg-slide-content">
          <span className="gg-hero-eyebrow">The Future of Sustainable Fashion</span>
          <h2 className="gg-hero-title">Experience the Glamour</h2>
          <p className="gg-hero-tagline">
            Indulge in a world of opulence and style with Glamour Gatherings.
          </p>

          <div className="gg-countdown" aria-live="polite" aria-label="Countdown to event">
            <div className="gg-time-box">
              <span className="gg-time-val" id="days">
                00
              </span>
              <span className="gg-time-label">Days</span>
            </div>
            <div className="gg-time-box">
              <span className="gg-time-val" id="hours">
                00
              </span>
              <span className="gg-time-label">Hours</span>
            </div>
            <div className="gg-time-box">
              <span className="gg-time-val" id="minutes">
                00
              </span>
              <span className="gg-time-label">Mins</span>
            </div>
            <div className="gg-time-box">
              <span className="gg-time-val" id="seconds">
                00
              </span>
              <span className="gg-time-label">Secs</span>
            </div>
          </div>

          <a href="#participate" className="gg-btn">
            Register Now
          </a>
        </div>
      </div>

      <div className="gg-slider-dots" role="tablist" aria-label="Hero slider dots"></div>
    </header>
  );
}

function AboutSection() {
  return (
    <section className="gg_about_section" id="about">
      <div className="gg_about_container">
        <div className="about-content">
          <h2 className="section-title">About Glamour Gatherings</h2>

          <p className="about-description">
            Glamour Gatherings is your premier destination for discovering and
            experiencing the most glamorous events and trends. We curate a
            collection of exclusive galas, fashion exhibitions, and lifestyle
            experiences that celebrate sophistication and style.
          </p>

          <p className="about-description">
            Our mission is to connect you with the world of glamour, providing
            insider insights, event highlights, and a community of like-minded
            individuals who share a passion for all things chic and luxurious.
          </p>

          <div className="feature-grid">
            <div className="feature-item">
              <div className="feature-icon">
                <i className="icon-leaf"></i>
              </div>
              <div className="feature-text">
                <h3>Sustainability focus</h3>
              </div>
            </div>
            <div className="feature-item">
              <div className="feature-icon">
                <i className="icon-heart" style={{ color: "#501122" }}></i>
              </div>
              <div className="feature-text">
                <h3>Cultural values</h3>
              </div>
            </div>
            <div className="feature-item">
              <div className="feature-icon">
                <i className="icon-earth"></i>
              </div>
              <div className="feature-text">
                <h3>Eco-conscious brands only</h3>
              </div>
            </div>
            <div className="feature-item">
              <div className="feature-icon">
                <i className="icon-star"></i>
              </div>
              <div className="feature-text">
                <h3>Elegant fashion standards</h3>
              </div>
            </div>
          </div>
        </div>

        <div className="about-image-wrapper">
          <div className="image-frame">
            <img
              src="/assets/images/img/bg/gals.png"
              alt="About Glamour Gatherings"
              className="bg-hero-image"
            />
            <div className="frame-accent"></div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ParticipationSection({
  onOpenDialog,
  remaining,
}: {
  onOpenDialog: (id: string) => (e: ReactMouseEvent) => void;
  remaining: typeof DEFAULT_REMAINING;
}) {
  return (
    <section
      id="participate"
      className="gg-section-padding gg-participation"
      aria-labelledby="participate-heading"
    >
      <div className="gg-container">
        <div className="gg-text-center gg-reveal">
          <span className="gg-section-label">Join the Experience</span>
          <h2 id="participate-heading">Participation Categories</h2>
          <div className="gg-section-divider" aria-hidden="true"></div>
        </div>
        <div className="gg-cards-grid gg-reveal-stagger">
          <article className="gg-role-card">
            <i className="fas fa-ticket gg-role-icon" aria-hidden="true"></i>
            <h3>Audience</h3>
            <p>Attend the most elegant sustainable fashion event in Salem.</p>
            <span className="gg-tickets-badge">
              {remaining.audience} tickets left
            </span>
            <button
              className="gg-btn-outline1"
              type="button"
              onClick={onOpenDialog("modal-audience")}
            >
              Book Tickets
            </button>
          </article>
          <article className="gg-role-card">
            <i className="fas fa-person-walking gg-role-icon" aria-hidden="true"></i>
            <h3>Models</h3>
            <p>Decent, elegant, culturally aligned fashion outfits required.</p>
            <span className="gg-tickets-badge">
              {remaining.models} spots left
            </span>
            <button
              className="gg-btn-outline1"
              type="button"
              onClick={onOpenDialog("modal-model")}
            >
              Apply as Model
            </button>
          </article>
          <article className="gg-role-card">
            <i className="fas fa-brush gg-role-icon" aria-hidden="true"></i>
            <h3>Makeup Artists</h3>
            <p>Natural / sustainable / skin-friendly products preferred.</p>
            <span className="gg-tickets-badge">
              {remaining["makeup-artists"]} spots left
            </span>
            <button
              className="gg-btn-outline1"
              type="button"
              onClick={onOpenDialog("modal-mua")}
            >
              Apply as MUA
            </button>
          </article>
          <article className="gg-role-card">
            <i className="fas fa-store gg-role-icon" aria-hidden="true"></i>
            <h3>Stall Owners</h3>
            <p>Eco-friendly brands, handmade crafts, sustainable businesses.</p>
            <span className="gg-tickets-badge">
              {remaining["stall-owners"]} spots left
            </span>
            <button
              className="gg-btn-outline1"
              type="button"
              onClick={onOpenDialog("modal-stall")}
            >
              Apply for Stall
            </button>
          </article>
        </div>
      </div>
    </section>
  );
}

function SponsorsMarquee() {
  return (
    <section className="gg-marquee-section" aria-label="Our sponsors">
      <div className="gg-marquee-wrap" aria-hidden="true">
        {Array.from({ length: 6 }).map((_, index) => (
          <div className="gg-sponsor-logo" key={`logo-a-${index}`}>
            <img
              src="/assets/images/logo/ethiroli_logo.png"
              alt="Ethiroli logo"
              loading="lazy"
            />
          </div>
        ))}
        {Array.from({ length: 6 }).map((_, index) => (
          <div className="gg-sponsor-logo" key={`logo-b-${index}`}>
            <img
              src="/assets/images/logo/bumble_bee.png"
              alt="Bumble Bee logo"
              loading="lazy"
            />
          </div>
        ))}
        {Array.from({ length: 6 }).map((_, index) => (
          <div className="gg-sponsor-logo" key={`logo-c-${index}`}>
            <img src="/assets/images/logo/jci.png" alt="JCI logo" loading="lazy" />
          </div>
        ))}
      </div>
    </section>
  );
}

function ModelsSection() {
  return (
    <section id="models" className="gg-gallery-section dark" aria-labelledby="models-heading">
      <div className="gg-gallery-header gg-reveal">
        <span className="gg-section-label">Eco Fashion Walk</span>
        <h2 id="models-heading">Featured Models</h2>
        <div className="gg-section-divider" aria-hidden="true"></div>
      </div>

      <div className="gg-gallery-track-outer" aria-label="Scrolling model showcase">
        <div className="gg-gallery-track ltr">
          {[
            { name: "Ananya R.", img: "model1.png" },
            { name: "Divya M.", img: "model2.png" },
            { name: "Priya S.", img: "model3.png" },
            { name: "Kavya T.", img: "model4.png" },
            { name: "Saranya K.", img: "model5.png" },
            { name: "Meena L.", img: "model1.png" },
            { name: "Nithya J.", img: "model2.png" },
            { name: "Rani P.", img: "model3.png" },
            { name: "Lavanya V.", img: "model4.png" },
            { name: "Geetha B.", img: "model5.png" },
            { name: "Sindhu A.", img: "model1.png" },
            { name: "Rekha C.", img: "model2.png" },
            { name: "Uma D.", img: "model3.png" },
            { name: "Vani E.", img: "model4.png" },
            { name: "Mythili F.", img: "model5.png" },
            { name: "Sudha G.", img: "model1.png" },
            { name: "Janani H.", img: "model2.png" },
            { name: "Kamala I.", img: "model3.png" },
            { name: "Padma J.", img: "model4.png" },
            { name: "Chitra K.", img: "model5.png" },
          ].map((model, index) => (
            <article className="gg-person-card" key={`${model.name}-${index}`}>
              <div className="gg-card-shimmer" aria-hidden="true"></div>
              <img
                src={`/assets/images/model/${model.img}`}
                alt={`Model ${index + 1} - Glamour Gatherings Eco Fashion Walk`}
                loading="lazy"
              />
              <div className="gg-person-overlay">
                <span className="gg-person-name">{model.name}</span>
                <span className="gg-person-role">Model</span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function MakeupArtistsSection() {
  return (
    <section className="gg-gallery-section mid" aria-labelledby="mua-heading">
      <div className="gg-gallery-header gg-reveal">
        <span className="gg-section-label">Styling and Beauty</span>
        <h2 id="mua-heading">Makeup Artists</h2>
        <div className="gg-section-divider" aria-hidden="true"></div>
      </div>

      <div className="gg-gallery-track-outer mid" aria-label="Scrolling makeup artist showcase">
        <div className="gg-gallery-track rtl">
          {[
            { name: "Sindhu A.", img: "make_up (1).png" },
            { name: "Rekha C.", img: "make_up (2).png" },
            { name: "Uma D.", img: "make_up (3).png" },
            { name: "Vani E.", img: "make_up (4).png" },
            { name: "Mythili F.", img: "make_up (1).png" },
            { name: "Sudha G.", img: "make_up (2).png" },
            { name: "Janani H.", img: "make_up (3).png" },
            { name: "Kamala I.", img: "make_up (4).png" },
            { name: "Padma J.", img: "make_up (1).png" },
            { name: "Chitra K.", img: "make_up (2).png" },
            { name: "Ananya R.", img: "make_up (3).png" },
            { name: "Divya M.", img: "make_up (4).png" },
            { name: "Priya S.", img: "make_up (1).png" },
            { name: "Kavya T.", img: "make_up (2).png" },
            { name: "Saranya K.", img: "make_up (3).png" },
            { name: "Meena L.", img: "make_up (4).png" },
            { name: "Nithya J.", img: "make_up (1).png" },
            { name: "Rani P.", img: "make_up (2).png" },
            { name: "Lavanya V.", img: "make_up (3).png" },
            { name: "Geetha B.", img: "make_up (4).png" },
          ].map((artist, index) => (
            <article className="gg-person-card" key={`${artist.name}-${index}`}>
              <div className="gg-card-shimmer" aria-hidden="true"></div>
              <img
                src={`/assets/images/make_up_artist/${artist.img}`}
                alt={`Makeup Artist ${index + 1} - Glamour Gatherings`}
                loading="lazy"
              />
              <div className="gg-person-overlay">
                <span className="gg-person-name">{artist.name}</span>
                <span className="gg-person-role">Makeup Artist</span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function ScheduleSection() {
  return (
    <section id="schedule" className="gg-section-padding gg-schedule" aria-labelledby="schedule-heading">
      <div className="gg-container">
        <div className="gg-text-center gg-reveal">
          <span className="gg-section-label">Event Day - 2 April 2026</span>
          <h2 id="schedule-heading">Event Schedule</h2>
          <div className="gg-section-divider" aria-hidden="true"></div>
          <p style={{ color: "var(--gg-accent)", marginTop: "0.75rem", fontSize: "0.9rem" }}>
            A Day of Elegance and Sustainability
          </p>
        </div>

        <div className="gg-timeline" role="list">
          {[
            {
              time: "09:00 AM",
              datetime: "09:00",
              title: "Registration and Welcome Desk",
              desc: "Attendee check-in, eco-friendly welcome kits, stall owner setup completion.",
            },
            {
              time: "10:00 AM",
              datetime: "10:00",
              title: "Opening Ceremony",
              desc: "Traditional lamp lighting, welcome speech by Event Director, Introduction to Sustainability Mission.",
            },
            {
              time: "10:30 AM",
              datetime: "10:30",
              title: "Sustainable Brand Showcase",
              desc: "Stalls open. Visitors explore eco-friendly handmade, recycled, organic product displays with live demonstrations.",
            },
          ].map((item) => (
            <div className="gg-timeline-item gg-reveal" role="listitem" key={item.time}>
              <div className="gg-timeline-dot" aria-hidden="true"></div>
              <div className="gg-time-card">
                <time className="gg-time" dateTime={item.datetime}>
                  {item.time}
                </time>
                <h3 className="gg-session-title">{item.title}</h3>
                <p className="gg-session-desc">{item.desc}</p>
              </div>
            </div>
          ))}

          <div className="gg-timeline-item gg-reveal" role="listitem">
            <div className="gg-timeline-dot" aria-hidden="true"></div>
            <div className="gg-time-card">
              <time className="gg-time" dateTime="12:00">
                12:00 PM
              </time>
              <h3 className="gg-session-title">Panel Discussion</h3>
              <p className="gg-session-desc">Topic: "Future of Sustainable Fashion"</p>
              <ul className="gg-participants-list">
                <li>Eco-brand founders</li>
                <li>Fashion designers</li>
                <li>Environmental advocates</li>
              </ul>
            </div>
          </div>

          {[
            {
              time: "01:00 PM",
              datetime: "13:00",
              title: "Lunch Break",
              desc: "Organic and local food vendors. Zero-plastic serving policy enforced.",
            },
          ].map((item) => (
            <div className="gg-timeline-item gg-reveal" role="listitem" key={item.time}>
              <div className="gg-timeline-dot" aria-hidden="true"></div>
              <div className="gg-time-card">
                <time className="gg-time" dateTime={item.datetime}>
                  {item.time}
                </time>
                <h3 className="gg-session-title">{item.title}</h3>
                <p className="gg-session-desc">{item.desc}</p>
              </div>
            </div>
          ))}

          <div className="gg-timeline-item gg-reveal" role="listitem">
            <div className="gg-timeline-dot" aria-hidden="true"></div>
            <div className="gg-time-card highlight">
              <time className="gg-time" dateTime="14:00">
                02:00 PM
              </time>
              <h3 className="gg-session-title">Eco Fashion Walk</h3>
              <p className="gg-session-desc">
                Main highlight. Models present sustainable collections with designer
                introductions. Jury evaluation in competition format.
              </p>
            </div>
          </div>

          {[
            {
              time: "03:30 PM",
              datetime: "15:30",
              title: "Makeup and Styling Demo",
              desc: "Natural makeup techniques, skin-friendly product showcase, live audience interaction.",
            },
            {
              time: "04:30 PM",
              datetime: "16:30",
              title: "Cultural Performances",
              desc: "Classical dance, fusion performances, and sustainable theme storytelling.",
            },
          ].map((item) => (
            <div className="gg-timeline-item gg-reveal" role="listitem" key={item.time}>
              <div className="gg-timeline-dot" aria-hidden="true"></div>
              <div className="gg-time-card">
                <time className="gg-time" dateTime={item.datetime}>
                  {item.time}
                </time>
                <h3 className="gg-session-title">{item.title}</h3>
                <p className="gg-session-desc">{item.desc}</p>
              </div>
            </div>
          ))}

          <div className="gg-timeline-item gg-reveal" role="listitem">
            <div className="gg-timeline-dot" aria-hidden="true"></div>
            <div className="gg-time-card">
              <time className="gg-time" dateTime="17:30">
                05:30 PM
              </time>
              <h3 className="gg-session-title">Awards and Recognition</h3>
              <ul className="gg-participants-list">
                <li>Best Sustainable Stall</li>
                <li>Best Eco Fashion Designer</li>
                <li>Best Model Presentation</li>
                <li>Audience Choice Award</li>
              </ul>
            </div>
          </div>

          <div className="gg-timeline-item gg-reveal" role="listitem">
            <div className="gg-timeline-dot" aria-hidden="true"></div>
            <div className="gg-time-card">
              <time className="gg-time" dateTime="18:00">
                06:00 PM
              </time>
              <h3 className="gg-session-title">Closing Ceremony</h3>
              <p className="gg-session-desc">
                Thank you speech, group photo, and networking session.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function VenueSection() {
  return (
    <section id="venue" className="gg-section-padding gg-venue" aria-labelledby="venue-heading">
      <div className="gg-container">
        <div className="gg-text-center gg-reveal">
          <span className="gg-section-label">Find Us</span>
          <h2 id="venue-heading">Venue Information</h2>
          <div className="gg-section-divider" aria-hidden="true"></div>
          <p style={{ maxWidth: "620px", margin: "1rem auto 0", color: "var(--ivory)", fontSize: "0.9rem" }}>
            Glamour Gatherings will be held at a prestigious event venue in the
            heart of Salem, Tamil Nadu - equipped with state-of-the-art
            facilities, elegant decor, and capacity for 500+ guests. Exact
            address confirmed on registration.
          </p>
        </div>
        <div className="gg-map-wrapper gg-reveal">
          <iframe
            src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d125322.27432700668!2d78.04820185820312!3d11.664229949999999!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3babf1e55555555b%3A0x9e7f72d3ef1ef6f3!2sSalem%2C%20Tamil%20Nadu!5e0!3m2!1sen!2sin!4v1700000000000!5m2!1sen!2sin"
            allowFullScreen
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            title="Glamour Gatherings venue location - Salem, Tamil Nadu"
          ></iframe>
        </div>
      </div>
    </section>
  );
}

function CtaSection() {
  return (
    <section
      className="gg-section-padding gg-text-center gg-cta-section"
      style={{
        background:
          "linear-gradient(rgba(0,0,0,0.48), rgba(0,0,0,0.8)), url('/assets/images/img/hero/Untitled design (1).png') center/cover no-repeat fixed",
      }}
      aria-label="Register for Glamour Gatherings"
    >
      <div className="gg-container gg-reveal" style={{ position: "relative", zIndex: 1 }}>
        <span className="gg-section-label">Don't Miss Out</span>
        <h2 style={{ fontSize: "clamp(1.8rem,4vw,2.8rem)", margin: "0.5rem 0 1rem" }}>
          Ready to Experience the Glamour?
        </h2>
        <p
          style={{
            marginBottom: "2rem",
            fontSize: "1rem",
            color: "var(--ivory)",
            maxWidth: "600px",
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          Join us at Glamour Gatherings and immerse yourself in a world of
          elegance, sustainability, and unforgettable cultural celebration.
        </p>
        <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
          <a href="#participate" className="gg-btn">
            Book Your Tickets
          </a>
          <a href="#schedule" className="gg-btn-outline">
            View Schedule
          </a>
        </div>
      </div>
    </section>
  );
}

function Footer({
  onOpenDialog,
}: {
  onOpenDialog: (id: string) => (e: ReactMouseEvent) => void;
}) {
  return (
    <footer id="contact" className="gg-footer" role="contentinfo">
      <div className="gg-container">
        <div className="gg-footer-grid">
          <div className="gg-footer-brand">
            <h4>
              GLAMOUR <span style={{ color: "var(--gg-eco-light)" }}>GATHERINGS</span>
            </h4>
            <p>
              Curating sustainable luxury and elegance in Salem, Tamil Nadu.
              Eco-fashion, culture, and community - all in one extraordinary day.
            </p>
            <div className="gg-footer-socials" aria-label="Social media links">
              <a href="#" className="gg-social-icon" aria-label="Instagram">
                <i className="fab fa-instagram" aria-hidden="true"></i>
              </a>
              <a href="#" className="gg-social-icon" aria-label="Facebook">
                <i className="fab fa-facebook-f" aria-hidden="true"></i>
              </a>
              <a href="#" className="gg-social-icon" aria-label="YouTube">
                <i className="fab fa-youtube" aria-hidden="true"></i>
              </a>
              <a href="#" className="gg-social-icon" aria-label="WhatsApp">
                <i className="fab fa-whatsapp" aria-hidden="true"></i>
              </a>
            </div>
          </div>
          <nav aria-label="Quick links">
            <div className="gg-footer-links">
              <h5>Quick Links</h5>
              <ul>
                <li>
                  <a href="#home">Home</a>
                </li>
                <li>
                  <a href="#about">About</a>
                </li>
                <li>
                  <a href="#schedule">Schedule</a>
                </li>
                <li>
                  <a href="#participate">Participate</a>
                </li>
                <li>
                  <a href="#venue">Venue</a>
                </li>
              </ul>
            </div>
          </nav>
          <nav aria-label="Participate options">
            <div className="gg-footer-links">
              <h5>Participate</h5>
              <ul>
                <li>
                  <a href="#" onClick={onOpenDialog("modal-stall")}>
                    Stall Owners
                  </a>
                </li>
                <li>
                  <a href="#" onClick={onOpenDialog("modal-model")}>
                    Models
                  </a>
                </li>
                <li>
                  <a href="#" onClick={onOpenDialog("modal-mua")}>
                    Makeup Artists
                  </a>
                </li>
                <li>
                  <a href="#" onClick={onOpenDialog("modal-audience")}>
                    Book Tickets
                  </a>
                </li>
              </ul>
            </div>
          </nav>
          <div className="gg-footer-links">
            <h5>Contact</h5>
            <ul>
              <li>
                <a href="mailto:info@glamourgatherings.in">
                  info@glamourgatherings.in
                </a>
              </li>
              <li>
                <a href="tel:+919876543210">+91 98765 43210</a>
              </li>
              <li>Salem, Tamil Nadu, India</li>
              <li>2 April 2026</li>
            </ul>
          </div>
        </div>
        <div className="gg-copyright">
          (c) 2026 Glamour Gatherings. All rights reserved.  |  Elegance -
          Sustainability - Culture
        </div>
      </div>
    </footer>
  );
}

function ScrollTopButton() {
  return (
    <button className="gg-scroll-top" id="scrollTop" aria-label="Scroll to top" type="button">
      <i className="fas fa-chevron-up" aria-hidden="true"></i>
    </button>
  );
}

function Modals({
  onSubmit,
}: {
  onSubmit: (
    endpoint: string,
    message: string
  ) => (e: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <>
      <dialog id="modal-stall" aria-labelledby="stall-modal-title">
        <div className="gg-modal-header">
          <h3 id="stall-modal-title">Stall Registration</h3>
          <button
            className="gg-close-modal"
            onClick={(e) =>
              (e.currentTarget.closest("dialog") as HTMLDialogElement).close()
            }
            aria-label="Close"
            type="button"
          >
            &times;
          </button>
        </div>
        <form
          method="dialog"
          onSubmit={onSubmit("stall-owners", "Stall application submitted!")}
        >
          <div className="gg-form-group">
            <label htmlFor="stall-biz">Business Name *</label>
            <input
              type="text"
              id="stall-biz"
              name="businessName"
              className="gg-form-control"
              required
              autoComplete="organization"
            />
          </div>
          <div className="gg-form-group">
            <label htmlFor="stall-owner">Owner Name *</label>
            <input
              type="text"
              id="stall-owner"
              name="ownerName"
              className="gg-form-control"
              required
              autoComplete="name"
            />
          </div>
          <div className="gg-form-group">
            <label htmlFor="stall-phone">Contact Number *</label>
            <input
              type="tel"
              id="stall-phone"
              name="contactNumber"
              className="gg-form-control"
              required
              autoComplete="tel"
            />
          </div>
          <div className="gg-form-group">
            <label htmlFor="stall-email">Email</label>
            <input
              type="email"
              id="stall-email"
              name="email"
              className="gg-form-control"
              autoComplete="email"
            />
          </div>
          <div className="gg-form-group">
            <label htmlFor="stall-desc">Business Description</label>
            <textarea
              id="stall-desc"
              name="desc"
              className="gg-form-control"
              rows={3}
              placeholder="Briefly describe your eco-friendly products or brand..."
            ></textarea>
          </div>
          <div
            className="gg-form-group"
            style={{ display: "flex", alignItems: "flex-start", gap: "0.6rem" }}
          >
            <input
              type="checkbox"
              id="stall-agree"
              name="agreement"
              required
              style={{
                width: "16px",
                minWidth: "16px",
                marginTop: "3px",
                accentColor: "var(--gg-primary)",
              }}
            />
            <label
              htmlFor="stall-agree"
              style={{ textTransform: "none", letterSpacing: 0, fontSize: "0.82rem" }}
            >
              I understand that stall allocation is approval-based and organisers
              are not responsible for damage or theft.
            </label>
          </div>
          <button type="submit" className="gg-btn" style={{ width: "100%" }}>
            Submit Application
          </button>
        </form>
      </dialog>

      <dialog id="modal-model" aria-labelledby="model-modal-title">
        <div className="gg-modal-header">
          <h3 id="model-modal-title">Model Registration</h3>
          <button
            className="gg-close-modal"
            onClick={(e) =>
              (e.currentTarget.closest("dialog") as HTMLDialogElement).close()
            }
            aria-label="Close"
            type="button"
          >
            &times;
          </button>
        </div>
        <form
          method="dialog"
          onSubmit={onSubmit("models", "Model application submitted!")}
        >
          <div className="gg-form-group">
            <label htmlFor="model-name">Full Name *</label>
            <input
              type="text"
              id="model-name"
              name="fullName"
              className="gg-form-control"
              required
              autoComplete="name"
            />
          </div>
          <div className="gg-form-group">
            <label htmlFor="model-age">Age *</label>
            <input
              type="number"
              id="model-age"
              name="age"
              className="gg-form-control"
              min={16}
              max={65}
              required
            />
          </div>
          <div className="gg-form-group">
            <label htmlFor="model-phone">Contact Number *</label>
            <input
              type="tel"
              id="model-phone"
              name="contactNumber"
              className="gg-form-control"
              required
              autoComplete="tel"
            />
          </div>
          <div className="gg-form-group">
            <label htmlFor="model-email">Email</label>
            <input
              type="email"
              id="model-email"
              name="email"
              className="gg-form-control"
              autoComplete="email"
            />
          </div>
          <div className="gg-form-group">
            <label htmlFor="model-outfit">Outfit Style Description *</label>
            <textarea
              id="model-outfit"
              name="outfitDescription"
              className="gg-form-control"
              rows={3}
              required
              placeholder="Describe your sustainable/cultural outfit concept..."
            ></textarea>
          </div>
          <div
            className="gg-form-group"
            style={{ display: "flex", alignItems: "flex-start", gap: "0.6rem" }}
          >
            <input
              type="checkbox"
              id="model-agree"
              name="agreement"
              required
              style={{
                width: "16px",
                minWidth: "16px",
                marginTop: "3px",
                accentColor: "var(--gg-primary)",
              }}
            />
            <label
              htmlFor="model-agree"
              style={{ textTransform: "none", letterSpacing: 0, fontSize: "0.82rem" }}
            >
              I confirm my outfit is decent, elegant, and culturally aligned as per
              event guidelines.
            </label>
          </div>
          <button type="submit" className="gg-btn" style={{ width: "100%" }}>
            Submit Application
          </button>
        </form>
      </dialog>

      <dialog id="modal-mua" aria-labelledby="mua-modal-title">
        <div className="gg-modal-header">
          <h3 id="mua-modal-title">Makeup Artist Registration</h3>
          <button
            className="gg-close-modal"
            onClick={(e) =>
              (e.currentTarget.closest("dialog") as HTMLDialogElement).close()
            }
            aria-label="Close"
            type="button"
          >
            &times;
          </button>
        </div>
        <form
          method="dialog"
          onSubmit={onSubmit("makeup-artists", "Makeup artist application submitted!")}
        >
          <div className="gg-form-group">
            <label htmlFor="mua-name">Full Name *</label>
            <input
              type="text"
              id="mua-name"
              name="fullName"
              className="gg-form-control"
              required
              autoComplete="name"
            />
          </div>
          <div className="gg-form-group">
            <label htmlFor="mua-exp">Experience (Years) *</label>
            <input type="number" id="mua-exp" name="experience" className="gg-form-control" min={0} required />
          </div>
          <div className="gg-form-group">
            <label htmlFor="mua-phone">Contact Number *</label>
            <input
              type="tel"
              id="mua-phone"
              name="contactNumber"
              className="gg-form-control"
              required
              autoComplete="tel"
            />
          </div>
          <div className="gg-form-group">
            <label htmlFor="mua-email">Email</label>
            <input type="email" id="mua-email" name="email" className="gg-form-control" autoComplete="email" />
          </div>
          <div className="gg-form-group">
            <label htmlFor="mua-spec">Specialization</label>
            <input
              type="text"
              id="mua-spec"
              name="specialization"
              className="gg-form-control"
              placeholder="e.g. Bridal, Editorial, Natural..."
            />
          </div>
          <button type="submit" className="gg-btn" style={{ width: "100%" }}>
            Submit Application
          </button>
        </form>
      </dialog>

      <dialog id="modal-audience" aria-labelledby="audience-modal-title">
        <div className="gg-modal-header">
          <h3 id="audience-modal-title">Book Tickets</h3>
          <button
            className="gg-close-modal"
            onClick={(e) =>
              (e.currentTarget.closest("dialog") as HTMLDialogElement).close()
            }
            aria-label="Close"
            type="button"
          >
            &times;
          </button>
        </div>
        <form
          method="dialog"
          onSubmit={onSubmit("audience", "Tickets booked successfully!")}
        >
          <div className="gg-form-group">
            <label htmlFor="aud-name">Full Name *</label>
            <input
              type="text"
              id="aud-name"
              name="fullName"
              className="gg-form-control"
              required
              autoComplete="name"
            />
          </div>
          <div className="gg-form-group">
            <label htmlFor="aud-tickets">Number of Tickets *</label>
            <input type="number" id="aud-tickets" name="tickets" min={1} max={10} className="gg-form-control" required />
          </div>
          <div className="gg-form-group">
            <label htmlFor="aud-phone">Contact Number *</label>
            <input
              type="tel"
              id="aud-phone"
              name="contactNumber"
              className="gg-form-control"
              required
              autoComplete="tel"
            />
          </div>
          <div className="gg-form-group">
            <label htmlFor="aud-email">Email</label>
            <input type="email" id="aud-email" name="email" className="gg-form-control" autoComplete="email" />
          </div>
          <button type="submit" className="gg-btn" style={{ width: "100%" }}>
            Pay and Register
          </button>
        </form>
      </dialog>
    </>
  );
}
