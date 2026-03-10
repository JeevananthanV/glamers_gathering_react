'use strict';

(() => {
  const qs = (s, root = document) => root.querySelector(s);
  const qsa = (s, root = document) => Array.from(root.querySelectorAll(s));

  function initPreloader() {
    const preloader = qs('#gg-preloader');
    if (!preloader) return;

    window.addEventListener('load', () => {
      setTimeout(() => {
        preloader.style.opacity = '0';
        setTimeout(() => {
          preloader.style.display = 'none';
        }, 700);
      }, 700);
    });
  }

  function initMobileNav() {
    const navToggle = qs('.gg-mobile-toggle');
    const navMenu = qs('.gg-nav-menu');
    if (!navToggle || !navMenu) return;

    navToggle.addEventListener('click', () => {
      const isOpen = navMenu.classList.toggle('active');
      navToggle.innerHTML = isOpen
        ? '<i class="fas fa-times" aria-hidden="true"></i>'
        : '<i class="fas fa-bars" aria-hidden="true"></i>';
      navToggle.setAttribute('aria-expanded', String(isOpen));
    });

    qsa('a', navMenu).forEach((link) => {
      link.addEventListener('click', () => {
        navMenu.classList.remove('active');
        navToggle.innerHTML = '<i class="fas fa-bars" aria-hidden="true"></i>';
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  function initNavScroll() {
    const nav = qs('.gg-nav');
    const scrollTopBtn = qs('#scrollTop');

    window.addEventListener(
      'scroll',
      () => {
        const y = window.scrollY;
        if (nav) nav.classList.toggle('scrolled', y > 50);
        if (scrollTopBtn) scrollTopBtn.classList.toggle('visible', y > 400);
      },
      { passive: true }
    );

    if (scrollTopBtn) {
      scrollTopBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
  }

  function initHeroSlider() {
    const slider = qs('.gg-hero-slider');
    if (!slider) return;

    const slides = qsa('.gg-slide', slider);
    const dotsContainer = qs('.gg-slider-dots', slider);
    const prevBtn = qs('#prev-slide', slider) || qs('#prev-slide');
    const nextBtn = qs('#next-slide', slider) || qs('#next-slide');

    if (!slides.length) return;

    let current = Math.max(
      0,
      slides.findIndex((s) => s.classList.contains('active'))
    );

    let autoTimer = null;
    const intervalMs = 3500;
    const hasArrowControls = !!(prevBtn && nextBtn);
    const dots = [];

    if (dotsContainer) {
      dotsContainer.innerHTML = '';
      slides.forEach((_, i) => {
        const dot = document.createElement('button');
        dot.className = 'gg-dot';
        dot.type = 'button';
        dot.dataset.index = String(i);
        dot.setAttribute('role', 'tab');
        dot.setAttribute('aria-label', `Slide ${i + 1}`);
        dot.setAttribute('aria-selected', i === current ? 'true' : 'false');
        if (i === current) dot.classList.add('active');
        dotsContainer.appendChild(dot);
        dots.push(dot);
      });
    }
    const hasDots = dots.length > 0;

    const paint = () => {
      slides.forEach((slide, i) => {
        const active = i === current;
        slide.classList.toggle('active', active);
        slide.setAttribute('aria-hidden', String(!active));
      });

      if (hasDots) {
        dots.forEach((dot, i) => {
          const active = i === current;
          dot.classList.toggle('active', active);
          dot.setAttribute('aria-selected', String(active));
        });
      }
    };

    const showSlide = (idx) => {
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

    if (hasArrowControls) {
      nextBtn.addEventListener('click', () => {
        showSlide(current + 1);
        resetAuto();
      });

      prevBtn.addEventListener('click', () => {
        showSlide(current - 1);
        resetAuto();
      });
    }

    if (hasDots) {
      dots.forEach((dot) => {
        dot.addEventListener('click', (e) => {
          const idx = Number(e.currentTarget.dataset.index);
          if (Number.isNaN(idx)) return;
          showSlide(idx);
          resetAuto();
        });
      });
    }

    if (hasArrowControls || hasDots) {
      window.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight') {
          showSlide(current + 1);
          resetAuto();
        }
        if (e.key === 'ArrowLeft') {
          showSlide(current - 1);
          resetAuto();
        }
      });
    }

    paint();
    startAuto();
  }

  function initCountdown() {
    const dayEl = qs('#days');
    const hourEl = qs('#hours');
    const minuteEl = qs('#minutes');
    const secondEl = qs('#seconds');
    if (!dayEl || !hourEl || !minuteEl || !secondEl) return;

    const target = new Date('2026-03-02T09:00:00');
    const pad = (n) => String(n).padStart(2, '0');

    const tick = () => {
      const diff = target - Date.now();
      if (diff <= 0) {
        dayEl.textContent = '00';
        hourEl.textContent = '00';
        minuteEl.textContent = '00';
        secondEl.textContent = '00';
        return;
      }

      dayEl.textContent = pad(Math.floor(diff / 86400000));
      hourEl.textContent = pad(Math.floor((diff % 86400000) / 3600000));
      minuteEl.textContent = pad(Math.floor((diff % 3600000) / 60000));
      secondEl.textContent = pad(Math.floor((diff % 60000) / 1000));
    };

    tick();
    setInterval(tick, 1000);
  }

  function initDialogs() {
    qsa('dialog').forEach((d) => {
      d.addEventListener('click', (e) => {
        if (e.target === d) d.close();
      });
    });
  }

  function initReveal() {
    const revealEls = qsa('.gg-reveal, .gg-reveal-stagger');
    if (!revealEls.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('active');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 }
    );

    revealEls.forEach((el) => observer.observe(el));
  }

  function initSmoothScroll() {
    qsa('a[href^="#"]').forEach((anchor) => {
      anchor.addEventListener('click', (e) => {
        const href = anchor.getAttribute('href');
        if (!href || href === '#') return;

        const target = qs(href);
        if (!target) return;

        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initPreloader();
    initMobileNav();
    initNavScroll();
    initHeroSlider();
    initCountdown();
    initDialogs();
    initReveal();
    initSmoothScroll();
  });

  window.handleFormSubmit = function handleFormSubmit(e, msg) {
    e.preventDefault();
    const dialog = e.target.closest('dialog');
    if (dialog) dialog.close();

    const toast = document.createElement('div');
    toast.textContent = msg || 'Submitted';
    Object.assign(toast.style, {
      position: 'fixed',
      bottom: '2rem',
      left: '50%',
      transform: 'translateX(-50%) translateY(20px)',
      background: 'linear-gradient(135deg,#501122,#004a41)',
      color: '#fffef7',
      padding: '1rem 2rem',
      borderRadius: '50px',
      fontSize: '0.88rem',
      letterSpacing: '1px',
      zIndex: '9998',
      boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
      opacity: '0',
      transition: 'all 0.4s ease',
      fontFamily: "'Jost', sans-serif"
    });
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(-50%) translateY(0)';
    });

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 400);
    }, 2500);
  };
})();
