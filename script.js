function updateCountdown() {
  const dday = new Date(new Date().setHours(24, 0, 0, 0)).getTime();
  const now = new Date().getTime();
  const distance = dday - now;

  if (distance < 0) {
    document.querySelectorAll(".values span").forEach((el) => {
      el.textContent = "00";
    });
    return;
  }

  const d = String(Math.floor(distance / (1000 * 60 * 60 * 24))).padStart(2, "0");
  const h = String(Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))).padStart(2, "0");
  const m = String(Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60))).padStart(2, "0");
  let s = Math.floor((distance % (1000 * 60)) / 1000);
  if (s < 10) {
    s = `0${s}`;
  }

  document.getElementById("day").textContent = d;
  document.getElementById("hour").textContent = h;
  document.getElementById("minute").textContent = m;
  document.getElementById("second").textContent = s;

  document.getElementById("hours").textContent = h;
  document.getElementById("mins").textContent = m;
  document.getElementById("secs").textContent = s;
}

function bindInputFilters() {
  document.querySelectorAll(".numbersOnly").forEach((input) => {
    input.addEventListener("input", () => {
      input.value = input.value.replace(/[^0-9]/g, "");
    });
  });
  document.querySelectorAll("form").forEach((form) => {
    const hp2 = form.querySelector("input[name='HP2']");
    const hp3 = form.querySelector("input[name='HP3']");
    if (!hp2 || !hp3) return;

    hp2.addEventListener("input", () => {
      if (hp2.value.length >= 4) {
        hp3.focus();
      }
    });

    hp3.addEventListener("keydown", (event) => {
      if (event.key === "Backspace" && hp3.value.length === 0) {
        hp2.focus();
      }
    });
  });
}

const SHEET_ENDPOINT = "https://script.google.com/macros/s/AKfycbydHIwzsy7bA40udLCaT4ZEF0YSJ-mx-Gx-UNZwDD0ltWRS1NkdPw7vLPSX968xziM/exec";

async function sendToSheet(payload) {
  if (!SHEET_ENDPOINT || SHEET_ENDPOINT.includes("REPLACE_WITH")) {
    return false;
  }
  try {
    const res = await fetch(SHEET_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: payload
    });
    if (res.ok) return true;
    throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    console.warn("CORS/네트워크 문제로 no-cors 방식으로 재시도합니다.", err);
    try {
      await fetch(SHEET_ENDPOINT, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: payload
      });
      return true;
    } catch (fallbackErr) {
      console.error("no-cors fallback 실패", fallbackErr);
      return false;
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendWithRetry(payload, maxAttempts, delayMs) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const ok = await sendToSheet(payload);
    if (ok) return true;
    if (attempt < maxAttempts) {
      await sleep(delayMs * attempt);
    }
  }
  return false;
}

function buildSheetPayload(form) {
  const name = (form.querySelector("input[name='ST_NM']")?.value || "").trim();
  const hp1 = form.querySelector("select[name='HP1']")?.value || "";
  const hp2 = form.querySelector("input[name='HP2']")?.value || "";
  const hp3 = form.querySelector("input[name='HP3']")?.value || "";
  const phone = [hp1, hp2, hp3].filter(Boolean).join("-");
  const payCate = form.querySelector("input[name='pay_cate']:checked")?.value || "";
  const deptCate = form.querySelector("input[name='dept_cate']:checked")?.value || "";

  return new URLSearchParams({
    timestamp: new Date().toISOString(),
    name,
    phone,
    pay_cate: payCate,
    dept_cate: deptCate,
    ua: navigator.userAgent,
    referer: location.href
  }).toString();
}

async function disableButtonAndSubmit(buttonId, formId, timeoutMs) {
  const button = document.querySelector(buttonId);
  const form = document.getElementById(formId);
  const toast = document.getElementById("submitToast");
  if (!button || !form) {
    return;
  }

  button.disabled = true;
  button.textContent = "전송 중...";
  if (toast) {
    toast.classList.add("is-visible");
    toast.setAttribute("aria-hidden", "false");
    setTimeout(() => {
      toast.classList.remove("is-visible");
      toast.setAttribute("aria-hidden", "true");
    }, 3000);
  }

  const payload = buildSheetPayload(form);
  const ok = await sendWithRetry(payload, 3, 800);
  if (!ok) {
    if (toast) {
      toast.classList.remove("is-visible");
      toast.setAttribute("aria-hidden", "true");
    }
    alert("전송에 실패했습니다. 잠시 후 다시 시도해주세요.");
    button.disabled = false;
    button.textContent = "비밀지원금 확인하기";
    return;
  }

  form.submit();

  setTimeout(() => {
    button.disabled = false;
    button.textContent = "비밀지원금 확인하기";
  }, timeoutMs);
}

async function validateForm(formId, nameId, agreeId, buttonId) {
  const form = document.getElementById(formId);
  const nameInput = document.getElementById(nameId);
  const agree = document.getElementById(agreeId);

  if (!form || !nameInput || !agree) {
    return;
  }

  const name = nameInput.value.trim();
  const payChecked = form.querySelector("input[name='pay_cate']:checked");
  const deptChecked = form.querySelector("input[name='dept_cate']:checked");

  if (!payChecked) {
    alert("희망 통신사를 선택해주세요.");
    return;
  }
  if (!deptChecked) {
    alert("원하시는 상품을 선택해주세요.");
    return;
  }
  if (!name) {
    alert("성함을 입력해주세요.");
    nameInput.focus();
    return;
  }

  const hp2 = form.querySelector("input[name='HP2']");
  const hp3 = form.querySelector("input[name='HP3']");

  if (!hp2.value || hp2.value.length !== 4) {
    alert("연락처를 4자리로 입력해주세요.");
    hp2.focus();
    return;
  }
  if (!hp3.value || hp3.value.length !== 4) {
    alert("연락처를 4자리로 입력해주세요.");
    hp3.focus();
    return;
  }

  if (!agree.checked) {
    alert("개인정보 취급방침에 동의해 주세요.");
    return;
  }

  await disableButtonAndSubmit(buttonId, formId, 5000);
}

function bindFormButtons() {
  const btn1 = document.getElementById("btn_complete1");
  const btn2 = document.getElementById("btn_complete2");

  btn1.addEventListener("click", () => validateForm("form0", "ST_NM", "agree1", "#btn_complete1"));
  btn2.addEventListener("click", () => validateForm("form1", "ST_NM2", "agree2", "#btn_complete2"));

  const privacyUrl = "privacy.html";
  document.getElementById("privacyBtn1").addEventListener("click", () => {
    window.open(privacyUrl, "privacy", "toolbar=yes,scrollbars=yes,resizable=yes,width=770,height=700");
  });
  document.getElementById("privacyBtn2").addEventListener("click", () => {
    window.open(privacyUrl, "privacy", "toolbar=yes,scrollbars=yes,resizable=yes,width=770,height=700");
  });
}

function updateTickerDates() {
  const items = document.querySelectorAll(".ticker-item");
  if (!items.length) return;

  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const dateText = `${yyyy}-${mm}-${dd}`;

  items.forEach((item) => {
    const dateSpan = item.querySelector("span");
    if (dateSpan) {
      dateSpan.textContent = dateText;
    }
  });
}

function setupTicker() {
  const track = document.getElementById("tickerTrack");
  if (!track) return;

  const items = Array.from(track.children);
  if (items.length === 0) return;

  const fragment = document.createDocumentFragment();
  items.forEach((item) => {
    fragment.appendChild(item.cloneNode(true));
  });
  track.appendChild(fragment);

  const duration = Math.max(items.length * 2.4, 12);
  track.style.setProperty("--ticker-duration", `${duration}s`);
}

function bindStickyCta() {
  const button = document.getElementById("stickyCtaBtn");
  const form = document.getElementById("form0");
  if (!button || !form) return;

  button.addEventListener("click", () => {
    form.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => {
      const firstInput = form.querySelector("input[name='ST_NM']");
      if (firstInput) {
        firstInput.focus();
      }
    }, 500);
  });
}

bindInputFilters();
bindFormButtons();
updateTickerDates();
setupTicker();
bindStickyCta();
updateCountdown();
setInterval(updateCountdown, 1000);
