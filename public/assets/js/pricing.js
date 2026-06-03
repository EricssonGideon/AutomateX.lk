    const revealItems = document.querySelectorAll(".reveal");

    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.14 }
    );

    revealItems.forEach((item, index) => {
      item.style.transitionDelay = `${Math.min(index * 45, 260)}ms`;
      revealObserver.observe(item);
    });

    const packageTrack = document.getElementById("packageTrack");
    const packageDots = Array.from(document.querySelectorAll(".package-dot"));
    const packageCards = packageTrack ? Array.from(packageTrack.querySelectorAll(".package-card")) : [];
    const slideshowEnabled = packageTrack?.dataset.slideshow === "true";
    const slideshowIntervalMs = 6000;
    const isMobilePricingLayout = window.matchMedia("(max-width: 768px)").matches;

    function updateActiveDot(index) {
      packageDots.forEach((dot, dotIndex) => {
        dot.classList.toggle("bg-brand", dotIndex === index);
        dot.classList.toggle("scale-125", dotIndex === index);
        dot.classList.toggle("bg-slate-300", dotIndex !== index);
      });
    }

    if (packageTrack && packageCards.length && packageDots.length && !isMobilePricingLayout) {
      if (slideshowEnabled) {
        packageTrack.classList.add("slideshow-enabled");
      }

      updateActiveDot(0);

      const syncActiveCard = () => {
        const trackCenter = packageTrack.scrollLeft + packageTrack.clientWidth / 2;
        let activeIndex = 0;
        let smallestDistance = Number.POSITIVE_INFINITY;

        packageCards.forEach((card, index) => {
          const cardCenter = card.offsetLeft + card.clientWidth / 2;
          const distance = Math.abs(trackCenter - cardCenter);
          if (distance < smallestDistance) {
            smallestDistance = distance;
            activeIndex = index;
          }
        });

        updateActiveDot(activeIndex);
      };

      packageTrack.addEventListener("scroll", syncActiveCard, { passive: true });

      packageDots.forEach((dot, index) => {
        dot.addEventListener("click", () => {
          packageCards[index].scrollIntoView({
            behavior: "smooth",
            inline: "center",
            block: "nearest"
          });
        });
      });

      let autoSlideIndex = 0;
      let autoSlideTimer = null;

      const startAutoSlide = () => {
        if (window.innerWidth < 1024) {
          return null;
        }

        if (!slideshowEnabled) {
          return null;
        }

        return window.setInterval(() => {
          autoSlideIndex = (autoSlideIndex + 1) % packageCards.length;
          packageCards[autoSlideIndex].scrollIntoView({
            behavior: "smooth",
            inline: "center",
            block: "nearest"
          });
        }, slideshowIntervalMs);
      };

      const resetAutoSlide = () => {
        if (autoSlideTimer) {
          window.clearInterval(autoSlideTimer);
        }
        autoSlideTimer = startAutoSlide();
      };

      autoSlideTimer = startAutoSlide();
      packageTrack.addEventListener("touchstart", resetAutoSlide, { passive: true });
      packageTrack.addEventListener("pointerdown", resetAutoSlide, { passive: true });
      packageTrack.addEventListener("mouseenter", () => {
        if (window.innerWidth >= 1024 && autoSlideTimer) {
          window.clearInterval(autoSlideTimer);
          autoSlideTimer = null;
        }
      });
      packageTrack.addEventListener("mouseleave", () => {
        if (window.innerWidth >= 1024) {
          resetAutoSlide();
        }
      });
      window.addEventListener("resize", resetAutoSlide);
    }