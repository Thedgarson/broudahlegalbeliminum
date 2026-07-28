(async () => {
  "use strict";

  const lockScreen = document.getElementById("lockScreen");
  const bookApp = document.getElementById("bookApp");
  const unlockForm = document.getElementById("unlockForm");
  const passwordInput = document.getElementById("password");
  const unlockButton = document.getElementById("unlockButton");
  const unlockStatus = document.getElementById("unlockStatus");
  const revealPassword = document.getElementById("revealPassword");
  const bookPage = document.getElementById("bookPage");
  const sectionNav = document.getElementById("sectionNav");
  const previousButton = document.getElementById("previousPage");
  const nextButton = document.getElementById("nextPage");
  const pageCount = document.getElementById("pageCount");
  const progressTrack = document.getElementById("progressTrack");
  const progressFill = document.getElementById("progressFill");
  const brandName = document.getElementById("brandName");
  const goToCover = document.getElementById("goToCover");
  const celebrateButton = document.getElementById("celebrateButton");
  const celebrationLayer = document.getElementById("celebrationLayer");
  const lockButton = document.getElementById("lockButton");
  const toast = document.getElementById("toast");

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  let birthdayBook = null;
  let currentPage = 0;
  let isTurning = false;
  let failedAttempts = 0;
  let touchStartX = null;
  let toastTimer = null;

  if (window.location.hostname === "terminal.local") {
    await new Promise((resolve) => {
      const previewScript = document.createElement("script");
      previewScript.src = "/preview/devina-book.js";
      previewScript.onload = resolve;
      previewScript.onerror = resolve;
      document.head.append(previewScript);
    });
  }

  function base64ToBytes(base64) {
    const binary = window.atob(base64);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }

  async function deriveKey(password, salt, iterations) {
    const keyMaterial = await window.crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      "PBKDF2",
      false,
      ["deriveKey"],
    );

    return window.crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt,
        iterations,
      },
      keyMaterial,
      {
        name: "AES-GCM",
        length: 256,
      },
      false,
      ["decrypt"],
    );
  }

  async function decryptVault(password) {
    if (
      window.location.hostname === "terminal.local" &&
      window.__BIRTHDAY_PREVIEW__
    ) {
      return structuredClone(window.__BIRTHDAY_PREVIEW__);
    }

    const vault = window.__BIRTHDAY_VAULT__;
    if (!vault || vault.version !== 1) {
      throw new Error("VAULT_MISSING");
    }

    const salt = base64ToBytes(vault.salt);
    const iv = base64ToBytes(vault.iv);
    const ciphertext = base64ToBytes(vault.ciphertext);
    const key = await deriveKey(password, salt, vault.iterations);
    const plaintext = await window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv,
      },
      key,
      ciphertext,
    );

    const payload = JSON.parse(decoder.decode(plaintext));
    if (
      !payload ||
      !payload.book ||
      !Array.isArray(payload.pages) ||
      payload.pages.length === 0
    ) {
      throw new Error("VAULT_INVALID");
    }
    return payload;
  }

  function cleanText(value, fallback = "") {
    return typeof value === "string" ? value : fallback;
  }

  function makeTextElement(tag, className, text) {
    const element = document.createElement(tag);
    element.className = className;
    element.textContent = cleanText(text);
    return element;
  }

  function makeCopy(page, index) {
    const copy = document.createElement("div");
    copy.className = "page-copy";

    if (page.type === "cover") {
      const heart = makeTextElement("div", "cover-heart", "♡");
      heart.setAttribute("aria-hidden", "true");
      copy.append(heart);
    } else {
      copy.append(
        makeTextElement(
          "span",
          "page-number",
          `${String(index + 1).padStart(2, "0")}  /  ${String(
            birthdayBook.pages.length,
          ).padStart(2, "0")}`,
        ),
      );
    }

    if (page.kicker) {
      copy.append(makeTextElement("p", "page-kicker", page.kicker));
    }
    copy.append(makeTextElement("h1", "page-title", page.title));
    if (page.body) {
      copy.append(makeTextElement("p", "page-body", page.body));
    }

    const signature = cleanText(page.signature);
    if (signature) {
      copy.append(makeTextElement("p", "page-signature", signature));
    }

    if (page.type === "closing") {
      const ornament = makeTextElement("p", "closing-ornament", "✦  ♡  ✦");
      ornament.setAttribute("aria-hidden", "true");
      copy.append(ornament);
    }

    return copy;
  }

  function makePhoto(page) {
    const figure = document.createElement("figure");
    figure.className = "page-photo";

    const photo = cleanText(page.photo);
    if (photo.startsWith("data:image/")) {
      const image = document.createElement("img");
      image.src = photo;
      image.alt = cleanText(page.photoAlt, `A memory with Devina`);
      figure.append(image);
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "photo-placeholder";
      const placeholderContent = document.createElement("div");
      placeholderContent.append(
        makeTextElement("span", "", "♡"),
        makeTextElement("strong", "", "Your photo belongs here"),
        makeTextElement(
          "small",
          "",
          "Open customize.html to add one of your favorite memories.",
        ),
      );
      placeholder.append(placeholderContent);
      figure.append(placeholder);
    }

    if (page.caption) {
      figure.append(makeTextElement("figcaption", "photo-caption", page.caption));
    }
    return figure;
  }

  function renderPage(index) {
    const page = birthdayBook.pages[index];
    const allowedTypes = ["cover", "photo", "letter", "closing"];
    const pageType = allowedTypes.includes(page.type) ? page.type : "photo";
    const layout = document.createElement("div");
    const photoSide = index % 2 === 0 ? "photo-right" : "photo-left";
    layout.className = `page-layout ${pageType} ${photoSide}`;

    const copy = makeCopy({ ...page, type: pageType }, index);
    if (pageType === "photo") {
      layout.append(makePhoto(page), copy);
    } else if (
      pageType === "cover" &&
      cleanText(page.photo).startsWith("data:image/")
    ) {
      layout.classList.add("cover-with-photo");
      layout.append(makePhoto(page), copy);
    } else {
      layout.append(copy);
    }

    bookPage.replaceChildren(layout);
    currentPage = index;
    updateBookControls();
  }

  function updateBookControls() {
    const total = birthdayBook.pages.length;
    const page = birthdayBook.pages[currentPage];
    const progress = ((currentPage + 1) / total) * 100;

    previousButton.disabled = currentPage === 0;
    nextButton.disabled = currentPage === total - 1;
    pageCount.textContent = `Page ${currentPage + 1} of ${total}`;
    progressFill.style.width = `${progress}%`;
    progressTrack.setAttribute("aria-valuemax", String(total));
    progressTrack.setAttribute("aria-valuenow", String(currentPage + 1));

    sectionNav.querySelectorAll(".section-pill").forEach((button) => {
      const isActive = Number(button.dataset.page) === currentPage;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-current", isActive ? "page" : "false");
      if (isActive) {
        button.scrollIntoView({
          behavior: reducedMotion.matches ? "auto" : "smooth",
          inline: "center",
          block: "nearest",
        });
      }
    });

    const pageTitle = cleanText(page.title, "Birthday book");
    document.title = `${pageTitle} · For ${cleanText(
      birthdayBook.book.recipient,
      "Devina",
    )}`;
  }

  function renderNavigation() {
    sectionNav.replaceChildren();
    birthdayBook.pages.forEach((page, index) => {
      const button = makeTextElement(
        "button",
        "section-pill",
        cleanText(page.section, `Page ${index + 1}`),
      );
      button.type = "button";
      button.dataset.page = String(index);
      button.addEventListener("click", () => goToPage(index));
      sectionNav.append(button);
    });
  }

  async function goToPage(target) {
    const total = birthdayBook?.pages?.length ?? 0;
    if (
      isTurning ||
      target < 0 ||
      target >= total ||
      target === currentPage
    ) {
      return;
    }

    isTurning = true;
    const direction = target > currentPage ? 1 : -1;
    const origin = direction > 0 ? "left center" : "right center";
    bookPage.style.transformOrigin = origin;

    if (!reducedMotion.matches && bookPage.animate) {
      const exitAnimation = bookPage.animate(
        [
          { opacity: 1, transform: "rotateY(0deg) translateX(0)" },
          {
            opacity: 0,
            transform: `rotateY(${direction * -16}deg) translateX(${
              direction * -2
            }%)`,
          },
        ],
        {
          duration: 230,
          easing: "cubic-bezier(.5,.05,.7,.35)",
          fill: "forwards",
        },
      );
      await exitAnimation.finished.catch(() => {});
      exitAnimation.cancel();
    }

    renderPage(target);

    if (!reducedMotion.matches && bookPage.animate) {
      const enterAnimation = bookPage.animate(
        [
          {
            opacity: 0,
            transform: `rotateY(${direction * 16}deg) translateX(${
              direction * 2
            }%)`,
          },
          { opacity: 1, transform: "rotateY(0deg) translateX(0)" },
        ],
        {
          duration: 320,
          easing: "cubic-bezier(.2,.75,.25,1)",
        },
      );
      await enterAnimation.finished.catch(() => {});
    }
    isTurning = false;
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("show");
    toastTimer = window.setTimeout(() => {
      toast.classList.remove("show");
    }, 2600);
  }

  function celebrate() {
    const symbols = ["♡", "♥", "✦", "❀"];
    const colors = ["#6f3044", "#c27c89", "#b9965a", "#e5afb4"];
    const amount = reducedMotion.matches ? 12 : 55;

    for (let index = 0; index < amount; index += 1) {
      const piece = document.createElement("span");
      piece.className = "confetti-piece";
      piece.textContent = symbols[Math.floor(Math.random() * symbols.length)];
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.color = colors[Math.floor(Math.random() * colors.length)];
      piece.style.fontSize = `${0.7 + Math.random() * 1.1}rem`;
      piece.style.setProperty("--drift", `${-90 + Math.random() * 180}px`);
      piece.style.setProperty(
        "--fall-duration",
        `${2.4 + Math.random() * 2.4}s`,
      );
      piece.style.animationDelay = `${Math.random() * 0.7}s`;
      celebrationLayer.append(piece);
      window.setTimeout(() => piece.remove(), 5600);
    }
    showToast("Happy birthday, Devina ♡");
  }

  async function unlockBook(event) {
    event.preventDefault();
    const password = passwordInput.value;
    if (!password) {
      unlockStatus.textContent = "Please enter the secret word first.";
      passwordInput.focus();
      return;
    }

    const isLocalPreview =
      window.location.hostname === "terminal.local" &&
      window.__BIRTHDAY_PREVIEW__;
    if (!isLocalPreview && !window.crypto?.subtle) {
      unlockStatus.textContent =
        "This browser cannot open the encrypted book. Try a current version of Chrome, Edge, Firefox, or Safari.";
      return;
    }

    unlockButton.disabled = true;
    unlockButton.querySelector("span").textContent = "Opening…";
    unlockStatus.textContent = "";

    try {
      birthdayBook = await decryptVault(password);
      failedAttempts = 0;
      passwordInput.value = "";
      brandName.textContent = `${cleanText(
        birthdayBook.book.recipient,
        "Devina",
      )}'s Story`;
      renderNavigation();
      renderPage(0);
      lockScreen.hidden = true;
      bookApp.hidden = false;
      window.scrollTo(0, 0);
      window.setTimeout(celebrate, reducedMotion.matches ? 0 : 420);
    } catch (error) {
      failedAttempts += 1;
      const delay = Math.min(4200, failedAttempts * 650);
      if (error?.message === "VAULT_MISSING") {
        unlockStatus.textContent =
          "The encrypted book file is missing. Make sure vault.js was uploaded beside index.html.";
      } else {
        unlockStatus.textContent =
          "That secret word did not open the book. Check it and try again.";
      }
      await new Promise((resolve) => window.setTimeout(resolve, delay));
      passwordInput.select();
    } finally {
      unlockButton.disabled = false;
      unlockButton.querySelector("span").textContent = "Open the book";
    }
  }

  unlockForm.addEventListener("submit", unlockBook);

  revealPassword.addEventListener("click", () => {
    const willShow = passwordInput.type === "password";
    passwordInput.type = willShow ? "text" : "password";
    revealPassword.textContent = willShow ? "Hide" : "Show";
    revealPassword.setAttribute("aria-pressed", String(willShow));
    revealPassword.setAttribute(
      "aria-label",
      willShow ? "Hide password" : "Show password",
    );
    passwordInput.focus();
  });

  previousButton.addEventListener("click", () => goToPage(currentPage - 1));
  nextButton.addEventListener("click", () => goToPage(currentPage + 1));
  goToCover.addEventListener("click", () => goToPage(0));
  celebrateButton.addEventListener("click", celebrate);
  lockButton.addEventListener("click", () => window.location.reload());

  document.addEventListener("keydown", (event) => {
    if (bookApp.hidden) {
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      goToPage(currentPage - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      goToPage(currentPage + 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      goToPage(0);
    } else if (event.key === "End") {
      event.preventDefault();
      goToPage(birthdayBook.pages.length - 1);
    }
  });

  bookPage.addEventListener(
    "touchstart",
    (event) => {
      touchStartX = event.changedTouches[0]?.clientX ?? null;
    },
    { passive: true },
  );

  bookPage.addEventListener(
    "touchend",
    (event) => {
      if (touchStartX === null) {
        return;
      }
      const touchEndX = event.changedTouches[0]?.clientX ?? touchStartX;
      const distance = touchEndX - touchStartX;
      touchStartX = null;
      if (Math.abs(distance) < 48) {
        return;
      }
      goToPage(currentPage + (distance < 0 ? 1 : -1));
    },
    { passive: true },
  );

  if (!window.__BIRTHDAY_VAULT__) {
    unlockStatus.textContent =
      "The encrypted book is not ready. Add vault.js beside this page.";
  }
})();
