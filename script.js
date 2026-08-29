const form = document.querySelector("#consultForm");
const message = document.querySelector("#formMessage");
const closeButton = document.querySelector("#closeButton");
const SHEET_ENDPOINT = "https://script.google.com/macros/s/AKfycbx2mND489TCQmGqu3Illssyu-uIET8oePEW_dAWXmlk9s1f3TqW7EKhE3ymOI1Kwj6I/exec";

closeButton?.addEventListener("click", () => {
  if (window.opener) {
    window.close();
    return;
  }
  window.location.href = "index.html";
});

form?.addEventListener("submit", (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  const services = formData.getAll("service");
  const name = String(formData.get("name") || "").trim();
  const tel1 = String(formData.get("tel1") || "").replace(/\D/g, "");
  const tel2 = String(formData.get("tel2") || "").replace(/\D/g, "");
  const tel3 = String(formData.get("tel3") || "").replace(/\D/g, "");
  const phone = `${tel1}${tel2}${tel3}`;
  const phoneWithHyphen = [tel1, tel2, tel3].filter(Boolean).join("-");
  const memo = String(formData.get("memo") || "").trim();

  if (services.length === 0) {
    message.textContent = "관심 서비스를 하나 이상 선택해 주세요.";
    return;
  }

  if (!name) {
    message.textContent = "이름을 입력해 주세요.";
    return;
  }

  if (!tel1 || tel2.length !== 4 || tel3.length !== 4 || phone.length < 10 || phone.length > 11) {
    message.textContent = "휴대폰 번호를 정확히 입력해 주세요.";
    return;
  }

  const payload = new URLSearchParams({
    timestamp: new Date().toISOString(),
    name,
    phone: phoneWithHyphen,
    pay_cate: services.join(","),
    dept_cate: "지원금 상담",
    ua: memo || "상담내용 없음",
    referer: location.href
  });

  submitLead(payload);
});

async function submitLead(payload) {
  const submitButton = form.querySelector("button[type='submit']");
  submitButton.disabled = true;
  submitButton.textContent = "전송 중...";
  message.textContent = "";

  try {
    const response = await fetch(SHEET_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: payload.toString()
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    handleSuccess();
  } catch (error) {
    try {
      await fetch(SHEET_ENDPOINT, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: payload.toString()
      });
      handleSuccess();
    } catch (fallbackError) {
      message.textContent = "전송에 실패했습니다. 잠시 후 다시 시도해 주세요.";
    }
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "지원금 바로 안내받기";
  }
}

function handleSuccess() {
  message.textContent = "비교 요청이 접수되었습니다. 상담 전용 번호로 안내드리겠습니다.";
  form.reset();
  const firstService = form.querySelector("input[name='service']");
  if (firstService) firstService.checked = true;
}
