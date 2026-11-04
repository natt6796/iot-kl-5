(() => {
  "use strict";

  const MAX_HISTORY = 120;
  const STALE_AFTER_MS = 30_000;
  const MIN_MOISTURE = 35;
  const MOISTURE_DEPTHS_CM = [5, 10, 15, 20];
  const $ = (selector) => document.querySelector(selector);
  const state = {
    reading: null,
    history: [],
    serialPort: null,
    reader: null,
    readTask: null,
    demoTimer: null,
    mode: "demo",
    rangeHours: 1,
    lastReadingAt: null,
    connectionStartedAt: null,
    lastWifiReceivedAt: null,
    wifiServerAvailable: false,
    cropStage: null,
  };
  const colors = ["#e58a42", "#cf9a60", "#bb7047", "#e7b473"];
  const initialDemo = { moisture: [61, 55, 68, 47], ph: 6.4, n: 38, p: 21, k: 67 };
  const stages = {
    seedling: {
      name: "ต้นอ่อน",
      days: "0–20 วัน",
      image: "./images/ต้นอ่อน.jpg",
      caption: "ต้นกล้าระยะตั้งตัว เริ่มสร้างใบและราก",
      water: "ดูแลความชื้นให้เหมาะกับวิธีปลูกและระยะตั้งตัว หลีกเลี่ยงทั้งดินแห้งจัดและน้ำท่วมต้นอ่อน การจัดการน้ำขึ้นกับการหว่านหรือปักดำ",
      nutrients: "เริ่มจากผลตรวจดินและแผนปุ๋ยในพื้นที่ อย่าเร่งไนโตรเจนจากสีใบหรือค่าเซ็นเซอร์อย่างเดียว หากต้นซีดให้ตรวจราก น้ำ และศัตรูพืชประกอบ",
      observe: "ติดตามการตั้งตัว ความสม่ำเสมอของต้น และค่าความชื้นทั้ง 4 ระดับ ตรวจหัววัดและตำแหน่งติดตั้งหากค่าแตกต่างกันมาก",
    },
    tillering: {
      name: "แตกกอ",
      days: "20–50 วัน",
      image: "./images/แตกกอ.jpg",
      caption: "ต้นข้าวแตกหน่อด้านข้างเพื่อเพิ่มจำนวนกอ",
      water: "รักษาน้ำตามระบบปลูกและสภาพพื้นที่ ไม่ปล่อยให้แห้งเครียดนาน สังเกตการระบายน้ำและจุดที่ความชื้นต่างกัน",
      nutrients: "ประเมินการเจริญเติบโตและผลตรวจดินก่อนให้ปุ๋ย หากผลตรวจแนะนำไนโตรเจน ให้แบ่งใส่ตามคำแนะนำท้องถิ่นแทนการใส่หนักครั้งเดียว",
      observe: "ดูจำนวนกอ สีใบ และอาการใบเหลือง ตรวจวัชพืชและรากก่อนสรุปว่าเป็นการขาดธาตุอาหาร",
    },
    booting: {
      name: "ตั้งท้อง",
      days: "50–100 วัน",
      image: "./images/ตั้งท้อง.png",
      caption: "ลำต้นเริ่มสร้างรวงภายในกาบใบ",
      water: "ระยะตั้งท้องไวต่อความเครียดของน้ำ รักษาน้ำให้สม่ำเสมอตามสภาพนาและคำแนะนำพื้นที่ พร้อมมีทางระบายน้ำเมื่อฝนมาก",
      nutrients: "หลีกเลี่ยงการใส่ปุ๋ยเพิ่มโดยไม่ตรวจระยะและผลวิเคราะห์ดิน การให้ไนโตรเจนมากหรือช้าเกินไปอาจเพิ่มความเสี่ยงต้นล้ม",
      observe: "สังเกตการเริ่มสร้างรวง การตั้งท้อง และการเปลี่ยนสีใบ หากข้อมูลหัววัดหยุดอัปเดตให้ตรวจบอร์ดก่อนใช้ตัดสินใจ",
    },
    heading: {
      name: "ออกรวง",
      days: "80–100 วัน",
      image: "./images/ออกรวง.png",
      caption: "รวงข้าวโผล่พ้นกาบใบและเริ่มออกดอก",
      water: "พยายามหลีกเลี่ยงการขาดน้ำช่วงออกรวงและออกดอก ปรับการระบายให้เหมาะกับฝนและระดับพื้นที่ ไม่จำเป็นต้องเพิ่มระดับน้ำโดยไม่ประเมินแปลง",
      nutrients: "ยึดแผนธาตุอาหารตามพันธุ์และผลตรวจดิน ไม่ใช้ตัวเลข NPK จากโมดูลที่ไม่ทราบหน่วยเพื่อคำนวณปุ๋ย",
      observe: "ติดตามการออกรวงและออกดอก ความสม่ำเสมอของน้ำ และโรค/แมลง ตรวจสอบคำแนะนำเฉพาะพันธุ์ในพื้นที่",
    },
    ripening: {
      name: "สุกแก่",
      days: "100–120 วัน",
      image: "./images/สุกแก่.png",
      caption: "รวงและเมล็ดข้าวพัฒนาสู่ระยะเก็บเกี่ยว",
      water: "วางแผนระบายน้ำก่อนเก็บเกี่ยวตามความแก่จริง ชนิดดินและสภาพอากาศ ไม่งดน้ำเร็วเกินไปจนกระทบการสะสมน้ำหนักเมล็ด",
      nutrients: "โดยทั่วไปไม่ควรเร่งปุ๋ยช่วงปลายโดยไม่มีคำแนะนำจากผู้เชี่ยวชาญ ตรวจสอบอายุเก็บเกี่ยวและข้อแนะนำของพันธุ์",
      observe: "ดูสีรวงและความแก่ของเมล็ด เตรียมทางเข้าแปลงและกำหนดวันเก็บเกี่ยวตามสภาพจริง ไม่ใช้จำนวนวันเพียงอย่างเดียว",
    },
  };
  const nutrientAdvice = {
    n: {
      unknown: "ยังไม่ทราบระดับจากผลตรวจดิน ค่า N บนหน้าจอเป็นตัวเลขดิบตามโมดูลและไม่สามารถบอกว่าขาดหรือเกินได้โดยลำพัง",
      low: "ยืนยันผลตรวจและชนิดหน่วยก่อน จากนั้นทำตามอัตราและจังหวะแบ่งใส่ไนโตรเจนที่หน่วยงานเกษตรแนะนำสำหรับพันธุ์และระยะนี้ หลีกเลี่ยงการใส่ก่อนฝนหนัก",
      adequate: "ระดับอยู่ในเกณฑ์ตามผลตรวจ ใช้แผนปุ๋ยสำหรับพื้นที่และระยะปลูก ไม่เพิ่มปุ๋ยไนโตรเจนเพียงเพราะต้องการเร่งสีใบ",
      high: "งดเพิ่มไนโตรเจนไว้ก่อนและยืนยันผลตรวจ การใส่มากเกินอาจทำให้ต้นอ่อนแอ ล้มง่าย หรือเพิ่มความเสี่ยงโรค แม้ค่าดินสูงก็ไม่มีสารปรับดินแบบครอบจักรวาล",
    },
    p: {
      unknown: "ยังไม่ทราบระดับจากผลตรวจดิน โมดูล NPK อาจรายงานหน่วยและวิธีสกัดต่างกัน จึงเทียบข้ามรุ่นไม่ได้",
      low: "ยืนยันด้วยผลตรวจดิน แล้วใช้ปุ๋ยฟอสเฟตตามคำแนะนำท้องถิ่นและช่วงเตรียมดิน/ปลูก จัดการน้ำไหลบ่าเพื่อลดการสูญเสียธาตุอาหาร",
      adequate: "ระดับอยู่ในเกณฑ์ตามผลตรวจ ใช้คำแนะนำปุ๋ยเฉพาะพื้นที่ ไม่จำเป็นต้องเพิ่มฟอสฟอรัสโดยไม่มีผลตรวจรองรับ",
      high: "หยุดการเติมฟอสฟอรัสเพิ่มเติมจนกว่าจะทบทวนผลตรวจและแผนปุ๋ย ลดการชะล้างออกจากแปลงและตรวจดินซ้ำตามคำแนะนำ",
    },
    k: {
      unknown: "ยังไม่ทราบระดับจากผลตรวจดิน ค่า K บนจอใช้วินิจฉัยการขาด/เกินไม่ได้จนกว่าจะรู้หน่วยและการปรับเทียบ",
      low: "ยืนยันผลตรวจและทำตามคำแนะนำการใช้ปุ๋ยโพแทสเซียมสำหรับแปลงนั้น การคืนฟาง/วัสดุพืชที่เหมาะสมอาจช่วยหมุนเวียนธาตุอาหาร แต่ไม่แทนผลตรวจ",
      adequate: "ระดับอยู่ในเกณฑ์ตามผลตรวจ รักษาแผนปุ๋ยตามคำแนะนำและจัดการฟางอย่างเหมาะสม ไม่เติมโพแทสเซียมเกินความจำเป็น",
      high: "งดเพิ่มโพแทสเซียมและตรวจยืนยันผล ระดับสูงอย่างเดียวไม่ควรแก้ด้วยสารเคมี ให้ผู้เชี่ยวชาญประเมินความเค็มและสมดุลธาตุอาหารก่อน",
    },
  };
  const PLANTING_DATE_KEY = "rice-field-planting-date";
  let plantingDate = null;

  function formatTime(date) {
    return date.toLocaleTimeString("th-TH", { hour12: false });
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function addHistory(reading, time = new Date()) {
    state.history.push({ time, moisture: [...reading.moisture] });
    state.history = state.history.slice(-MAX_HISTORY);
  }

  function setConnection(mode, label, detail) {
    state.mode = mode;
    const pill = $("#connection-pill");
    pill.classList.toggle("demo-pill", mode === "demo");
    pill.classList.toggle("connected-pill", mode === "connected" || mode === "wifi");
    pill.classList.toggle("connecting-pill", mode === "connecting");
    pill.classList.toggle("error-pill", mode === "error");
    $("#connection-label-status").textContent = label;
    $("#connection-detail").textContent = detail;
    $("#chart-status").textContent = mode === "demo" ? "กำลังแสดงข้อมูลตัวอย่าง" : mode === "wifi" ? "รับข้อมูลจาก Arduino ผ่าน Wi-Fi" : mode === "connected" ? "รับข้อมูลจาก Arduino ผ่าน Serial" : "รอข้อมูลจากบอร์ด";
    $("#connect-label").textContent = mode === "connected" ? "ตัด USB" : "เชื่อมต่อ USB";
    $("#connect-serial").classList.toggle("connected", mode === "connected");
  }

  function validateReading(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("ข้อมูลต้องเป็น JSON object");
    if (!Array.isArray(input.moisture) || input.moisture.length !== 4) throw new Error("ต้องส่งค่า moisture เป็นตัวเลข 4 ค่าใน array");
    const moisture = input.moisture.map((value) => Number(value));
    if (moisture.some((value) => !Number.isFinite(value) || value < 0 || value > 100)) throw new Error("ค่าความชื้นทั้ง 4 ระดับต้องอยู่ระหว่าง 0–100%");
    const ph = Number(input.ph);
    const n = Number(input.n);
    const p = Number(input.p);
    const k = Number(input.k);
    if (![ph, n, p, k].every(Number.isFinite)) throw new Error("ต้องระบุค่า ph, n, p และ k เป็นตัวเลข");
    if (ph < 0 || ph > 14) throw new Error("ค่า pH ต้องอยู่ระหว่าง 0–14");
    if ([n, p, k].some((value) => value < 0 || value > 100000)) throw new Error("ค่า NPK ต้องอยู่ระหว่าง 0–100000");
    return { moisture, ph, n, p, k };
  }

  function renderNotice(reading) {
    const lowZones = reading.moisture
      .map((value, index) => value < MIN_MOISTURE ? MOISTURE_DEPTHS_CM[index] : null)
      .filter((value) => value !== null);
    const banner = $("#sensor-alert");
    banner.classList.toggle("alert", lowZones.length > 0);
    $("#alert-icon").textContent = lowZones.length ? "!" : "✓";
    $("#alert-title").textContent = lowZones.length ? `ความชื้นต่ำกว่าค่าที่ตั้งไว้ ${lowZones.length} ระดับ` : "ความชื้นดินทั้ง 4 ระดับอยู่ในเกณฑ์";
    $("#alert-detail").textContent = lowZones.length
      ? `ระดับความลึก ${lowZones.join(", ")} cm มีความชื้นต่ำกว่า ${MIN_MOISTURE}% · โปรดตรวจสอบสภาพแปลงจริง`
      : `ค่า pH ${reading.ph.toFixed(1)} · ข้อมูลธาตุอาหารตามหน่วยของโมดูลที่ติดตั้ง`;
  }

  function render(reading, receivedAt = new Date()) {
    state.reading = reading;
    state.lastReadingAt = receivedAt;
    const average = reading.moisture.reduce((sum, value) => sum + value, 0) / reading.moisture.length;
    $("#average-moisture").textContent = Math.round(average);
    $("#moisture-summary-note").textContent = average < MIN_MOISTURE ? "ความชื้นต่ำ · ตรวจสอบน้ำในแปลง" : average > 85 ? "ความชื้นสูง · ตรวจสอบระดับน้ำ" : "ค่าเฉลี่ยจากหัววัด 4 ระดับ";
    $("#soil-ph").textContent = reading.ph.toFixed(1);
    $("#ph-note").textContent = reading.ph < 5.5 ? "เป็นกรด · ควรตรวจซ้ำ" : reading.ph <= 6.5 ? "ช่วงอ้างอิงทั่วไป · ติดตามต่อ" : reading.ph <= 7.5 ? "สูงกว่าช่วงอ้างอิง · ตรวจยืนยัน" : "ควรตรวจยืนยันด้วยวิธีมาตรฐาน";
    $("#nitrogen").textContent = Math.round(reading.n);
    $("#phosphorus").textContent = Math.round(reading.p);
    $("#potassium").textContent = Math.round(reading.k);
    $("#reading-ph").textContent = reading.ph.toFixed(1);
    $("#reading-n").textContent = Math.round(reading.n);
    $("#reading-p").textContent = Math.round(reading.p);
    $("#reading-k").textContent = Math.round(reading.k);
    $("#raw-n-value").textContent = `ค่าจากบอร์ด: ${Math.round(reading.n)} · ยังไม่ทราบหน่วย`;
    $("#raw-p-value").textContent = `ค่าจากบอร์ด: ${Math.round(reading.p)} · ยังไม่ทราบหน่วย`;
    $("#raw-k-value").textContent = `ค่าจากบอร์ด: ${Math.round(reading.k)} · ยังไม่ทราบหน่วย`;
    $("#online-count").textContent = "05";
    $("#online-note").textContent = state.mode === "demo" ? "ข้อมูลจำลอง 5 เซ็นเซอร์" : state.mode === "wifi" ? "รับข้อมูลผ่าน Wi-Fi" : "ได้รับข้อมูลจากบอร์ดล่าสุด";
    $("#online-meter-fill").style.width = "100%";
    $("#alert-time").textContent = `อัปเดตล่าสุด ${formatTime(receivedAt)}`;
    $("#last-updated").textContent = `อัปเดตเมื่อ ${formatTime(receivedAt)}`;
    $("#readings-count").textContent = "แสดงเซ็นเซอร์ 5 ชุด";
    reading.moisture.forEach((value, index) => {
      const point = index + 1;
      $(`#map-moisture-${point}`).textContent = `${Math.round(value)}%`;
      $(`#reading-moisture-${point}`).textContent = Math.round(value);
      $(`#reading-time-${point}`).textContent = formatTime(receivedAt);
      const card = document.querySelector(`[data-reading="moisture-${point}"]`);
      card.querySelector(".reading-track i").style.width = `${clamp(value, 0, 100)}%`;
      card.querySelector(".reading-status").textContent = value < MIN_MOISTURE ? "ค่าต่ำ" : "ออนไลน์";
      card.querySelector(".reading-status").classList.remove("offline");
      card.querySelector(".reading-status").classList.toggle("low", value < MIN_MOISTURE);
      const marker = document.querySelector(`[data-sensor="moisture-${point}"]`);
      marker.classList.toggle("dry-marker", value < MIN_MOISTURE);
    });
    $("#map-chemistry").textContent = `N ${Math.round(reading.n)} · P ${Math.round(reading.p)}`;
    $("#map-ph").textContent = `K ${Math.round(reading.k)} · pH ${reading.ph.toFixed(1)}`;
    $("#reading-time-ph").textContent = formatTime(receivedAt);
    renderNotice(reading);
    renderSoilAdvice(reading);
    drawChart(Date.now());
  }

  function renderSoilAdvice(reading) {
    $("#advice-ph-value").textContent = reading.ph.toFixed(1);
    let status;
    let advice;
    if (reading.ph < 5.5) {
      status = "ค่อนข้างเป็นกรด";
      advice = "ตรวจ pH ซ้ำด้วยวิธีมาตรฐานและขอผลความต้องการปูนจากการวิเคราะห์ดิน หากยืนยันว่าดินกรด ให้ใช้วัสดุปูนตามอัตราที่ผู้เชี่ยวชาญคำนวณตามชนิดดินและคลุกในช่วงเตรียมดิน อย่ากะอัตราจาก pH อย่างเดียว";
    } else if (reading.ph <= 6.5) {
      status = "ช่วงอ้างอิงทั่วไป";
      advice = "อยู่ในช่วงอ้างอิงทั่วไปสำหรับข้าว แต่ pH เปลี่ยนได้เมื่อน้ำขังและขึ้นกับวิธีวัด ติดตามผลและหลีกเลี่ยงการใส่ปูนหรือสารปรับ pH หากไม่มีผลตรวจรองรับ";
    } else if (reading.ph <= 7.5) {
      status = "สูงกว่าช่วงอ้างอิง";
      advice = "ตรวจซ้ำและพิจารณาคุณภาพน้ำ/สภาพดินก่อนปรับ หากยืนยันว่าด่าง ให้ขอคำแนะนำจากหน่วยงานดินในพื้นที่ ไม่ราดกรดหรือน้ำส้มสายชูลงแปลง";
    } else {
      status = "ควรตรวจยืนยัน";
      advice = "ค่าสูงควรตรวจซ้ำด้วยวิธีมาตรฐานและตรวจคุณสมบัติดินเพิ่มเติม อย่าใช้ยิปซัมหรือกรดเพียงเพราะ pH สูง—ยิปซัมใช้เฉพาะเมื่อผลตรวจยืนยันปัญหาโซดิกและมีอัตราที่เหมาะสม";
    }
    $("#advice-ph-status").textContent = status;
    $("#advice-ph-text").textContent = advice;
  }

  function renderStageGuidance(stageKey) {
    const stage = stages[stageKey];
    if (!stage) return;
    state.cropStage = stageKey;
    $("#selected-stage-name").textContent = stage.name;
    $("#selected-stage-days").textContent = stage.days;
    $("#guidance-stage-badge").textContent = `${stage.name} · ${stage.days}`;
    $("#stage-image").src = stage.image;
    $("#stage-image").alt = `ภาพประกอบระยะ${stage.name}ของข้าว`;
    $("#stage-image-title").textContent = stage.name;
    $("#stage-image-caption").textContent = stage.caption;
    $("#stage-water-advice").textContent = stage.water;
    $("#stage-nutrient-advice").textContent = stage.nutrients;
    $("#stage-observe-advice").textContent = stage.observe;
  }

  function getCropAgeDays(startDate, today = new Date()) {
    const [year, month, day] = startDate.split("-").map(Number);
    const [todayYear, todayMonth, todayDay] = [
      today.getFullYear(),
      today.getMonth() + 1,
      today.getDate(),
    ];
    const startUtc = Date.UTC(year, month - 1, day);
    const todayUtc = Date.UTC(todayYear, todayMonth - 1, todayDay);
    return Math.floor((todayUtc - startUtc) / 86_400_000);
  }

  function inferStage(ageDays) {
    if (ageDays < 0) return null;
    if (ageDays < 20) return "seedling";
    if (ageDays < 50) return "tillering";
    if (ageDays < 80) return "booting";
    if (ageDays < 100) return "heading";
    return "ripening";
  }

  function todayAsInputDate() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  function isValidPlantingDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00`);
    return !Number.isNaN(date.getTime())
      && date.getFullYear() === Number(value.slice(0, 4))
      && date.getMonth() + 1 === Number(value.slice(5, 7))
      && date.getDate() === Number(value.slice(8, 10));
  }

  function showStageGate() {
    $("#planting-date").value = plantingDate || "";
    $("#date-error").hidden = true;
    $("#cancel-date-edit").hidden = !plantingDate;
    $("#stage-continue").textContent = plantingDate ? "บันทึกวันปลูกและอัปเดตระยะ" : "บันทึกวันปลูกและเริ่มติดตาม →";
    $("#stage-gate").hidden = false;
    $("#app-shell").hidden = true;
    window.scrollTo(0, 0);
    $("#planting-date").focus();
  }

  function savePlantingDate() {
    const value = $("#planting-date").value;
    const error = $("#date-error");
    error.hidden = true;
    if (!isValidPlantingDate(value)) {
      error.textContent = "กรุณาเลือกวันที่ปลูกให้ถูกต้อง";
      error.hidden = false;
      return;
    }
    if (value > todayAsInputDate()) {
      error.textContent = "วันที่ปลูกต้องไม่เป็นวันในอนาคต";
      error.hidden = false;
      return;
    }
    try {
      localStorage.setItem(PLANTING_DATE_KEY, value);
    } catch (storageError) {
      error.textContent = "บันทึกวันปลูกในเบราว์เซอร์ไม่ได้ กรุณาอนุญาตพื้นที่จัดเก็บเว็บไซต์แล้วลองอีกครั้ง";
      error.hidden = false;
      return;
    }
    plantingDate = value;
    updateCropStage();
    $("#stage-gate").hidden = true;
    $("#app-shell").hidden = false;
    window.scrollTo(0, 0);
  }

  function updateCropStage() {
    if (!plantingDate) return;
    const ageDays = getCropAgeDays(plantingDate);
    const stageKey = inferStage(ageDays);
    if (!stageKey) {
      showStageGate();
      return;
    }
    renderStageGuidance(stageKey);
    const ageLabel = ageDays === 0 ? "วันปลูก" : ageDays > 120 ? `ปลูกแล้ว ${ageDays} วัน · เกินช่วงประมาณ` : `ปลูกแล้ว ${ageDays} วัน`;
    $("#crop-age-badge").textContent = ageLabel;
    $("#selected-stage-days").textContent = `${ageDays} วัน`;
    $("#stage-age-note").textContent = ageDays > 120
      ? `อายุประมาณ ${ageDays} วัน เกินช่วง 100–120 วันที่ตั้งไว้แล้ว ควรตรวจความแก่ของรวงและปรึกษาเจ้าหน้าที่เกษตรเรื่องช่วงเก็บเกี่ยว`
      : `ประมาณวันที่ ${ageDays + 1} ของการปลูก · ระยะจริงอาจต่างตามพันธุ์และสภาพแปลง`;
    $("#season-stage-name").textContent = stages[stageKey].name;
  }

  function updateNutrientAdvice(nutrient) {
    const status = $(`#status-${nutrient}`).value;
    $(`#advice-${nutrient}-text`).textContent = nutrientAdvice[nutrient][status];
    const card = document.querySelector(`[data-nutrient="${nutrient}"]`);
    card.dataset.status = status;
  }

  function clearReadings() {
    state.reading = null;
    state.lastReadingAt = null;
    $("#average-moisture").textContent = "--";
    $("#moisture-summary-note").textContent = "รอข้อมูลจากบอร์ด";
    $("#soil-ph").textContent = "--.-";
    $("#ph-note").textContent = "รอข้อมูลจากบอร์ด";
    $("#nitrogen").textContent = "--";
    $("#phosphorus").textContent = "--";
    $("#potassium").textContent = "--";
    $("#reading-ph").textContent = "--.-";
    $("#reading-n").textContent = "--";
    $("#reading-p").textContent = "--";
    $("#reading-k").textContent = "--";
    $("#map-chemistry").textContent = "N -- · P --";
    $("#map-ph").textContent = "K -- · pH --.-";
    $("#online-count").textContent = "00";
    $("#online-note").textContent = "รอข้อมูล JSON จากบอร์ด";
    $("#online-meter-fill").style.width = "0%";
    $("#alert-icon").textContent = "…";
    $("#alert-title").textContent = "กำลังรอข้อมูลจาก Arduino";
    $("#alert-detail").textContent = "ส่ง JSON หนึ่งบรรทัดต่อชุดข้อมูลผ่าน Serial เพื่อเริ่มติดตาม";
    $("#alert-time").textContent = "ยังไม่มีข้อมูล";
    $("#last-updated").textContent = "อัปเดตเมื่อ --:--:--";
    document.querySelectorAll(".reading-card").forEach((card) => {
      const status = card.querySelector(".reading-status");
      status.textContent = "รอข้อมูล";
      status.classList.remove("low");
      status.classList.add("offline");
      const track = card.querySelector(".reading-track i");
      track.style.width = "0%";
      card.querySelectorAll(".reading-value strong, .chemistry-reading-values strong").forEach((value) => {
        value.textContent = "--";
      });
      card.querySelectorAll(".reading-foot span:last-child").forEach((value) => {
        value.textContent = "--:--:--";
      });
    });
    for (let point = 1; point <= 4; point += 1) {
      $(`#map-moisture-${point}`).textContent = "--%";
      $(`#reading-moisture-${point}`).textContent = "--";
      document.querySelector(`[data-sensor="moisture-${point}"]`).classList.remove("dry-marker");
    }
    $("#reading-ph").textContent = "--.-";
    drawChart(Date.now());
  }

  function drawChart(now) {
    const canvas = $("#moisture-chart");
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(bounds.width * ratio);
    canvas.height = Math.round(bounds.height * ratio);
    const context = canvas.getContext("2d");
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, bounds.width, bounds.height);
    const rangeMs = state.rangeHours * 60 * 60_000;
    const start = now - rangeMs;
    const data = state.history.filter((point) => point.time.getTime() >= start);
    const plotWidth = bounds.width;
    const plotHeight = bounds.height;
    for (let sensorIndex = 0; sensorIndex < 4; sensorIndex += 1) {
      const points = data.filter((point) => Number.isFinite(point.moisture[sensorIndex]));
      if (points.length < 2) continue;
      context.beginPath();
      points.forEach((point, index) => {
        const x = clamp((point.time.getTime() - start) / rangeMs, 0, 1) * plotWidth;
        const y = plotHeight - clamp(point.moisture[sensorIndex], 0, 100) / 100 * plotHeight;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.strokeStyle = colors[sensorIndex];
      context.lineWidth = 1.6;
      context.lineJoin = "round";
      context.lineCap = "round";
      context.stroke();
    }
    const labelCount = 5;
    const labels = [];
    for (let index = 0; index < labelCount; index += 1) {
      const time = new Date(start + rangeMs * index / (labelCount - 1));
      labels.push(`<span>${index === labelCount - 1 ? "ตอนนี้" : state.rangeHours === 1 ? formatTime(time).slice(0, 5) : `${time.getHours().toString().padStart(2, "0")}:00`}</span>`);
    }
    $("#chart-x-labels").innerHTML = labels.join("");
  }

  function makeDemoReading() {
    const drift = () => (Math.random() - 0.5) * 2.4;
    return {
      moisture: initialDemo.moisture.map((value) => Math.round(clamp(value + drift(), 0, 100))),
      ph: Number((initialDemo.ph + (Math.random() - 0.5) * 0.12).toFixed(1)),
      n: Math.round(initialDemo.n + (Math.random() - 0.5) * 2),
      p: Math.round(initialDemo.p + (Math.random() - 0.5) * 2),
      k: Math.round(initialDemo.k + (Math.random() - 0.5) * 2),
    };
  }

  function startDemo() {
    state.history = [];
    state.connectionStartedAt = null;
    setConnection("demo", "โหมดตัวอย่าง", "ข้อมูลจำลอง");
    const time = Date.now();
    for (let index = 24; index >= 0; index -= 1) {
      const sample = makeDemoReading();
      addHistory(sample, new Date(time - index * 2_500));
    }
    render(makeDemoReading());
    window.clearInterval(state.demoTimer);
    state.demoTimer = window.setInterval(() => {
      if (state.mode !== "demo") return;
      const sample = makeDemoReading();
      const receivedAt = new Date();
      addHistory(sample, receivedAt);
      render(sample, receivedAt);
    }, 2_500);
  }

  async function pollWifi() {
    try {
      const response = await fetch("/api/latest", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      state.wifiServerAvailable = true;
      if (state.mode === "demo" && state.serialPort === null) {
        $("#connection-detail").textContent = "Wi-Fi พร้อมรับข้อมูล";
      }
      if (!result.reading || !Number.isFinite(result.receivedAt) || state.mode === "connected") return;
      if (result.receivedAt === state.lastWifiReceivedAt) return;

      const reading = validateReading(result.reading);
      state.lastWifiReceivedAt = result.receivedAt;
      window.clearInterval(state.demoTimer);
      state.demoTimer = null;
      const receivedAt = new Date(result.receivedAt);
      state.history.push({ time: receivedAt, moisture: [...reading.moisture] });
      state.history = state.history.slice(-MAX_HISTORY);
      state.connectionStartedAt = result.receivedAt;
      setConnection("wifi", "เชื่อมต่อผ่าน Wi-Fi", window.location.host);
      render(reading, receivedAt);
    } catch (error) {
      if (state.wifiServerAvailable) {
        state.wifiServerAvailable = false;
        if (state.mode === "demo") {
          $("#connection-detail").textContent = "เปิด server.py เพื่อใช้ Wi-Fi";
        }
      }
    }
  }

  function showToast(message, type = "") {
    const toast = document.createElement("div");
    toast.className = `toast ${type}`.trim();
    toast.textContent = message;
    $("#toast-region").append(toast);
    window.setTimeout(() => toast.remove(), 4_000);
  }

  async function disconnectSerial() {
    window.clearInterval(state.demoTimer);
    state.demoTimer = null;
    const port = state.serialPort;
    state.serialPort = null;
    const reader = state.reader;
    if (reader) {
      try {
        await reader.cancel();
      } catch (error) {
        if (error.name !== "AbortError" && error.name !== "TypeError") throw error;
      }
      if (state.reader === reader) {
        reader.releaseLock();
        state.reader = null;
      }
    }
    if (state.readTask) {
      try {
        await state.readTask;
      } catch (error) {
        if (error.name !== "AbortError" && error.name !== "TypeError") throw error;
      }
      state.readTask = null;
    }
    if (port) await port.close();
  }

  async function readSerial(port) {
    const decoder = new TextDecoderStream();
    const closed = port.readable.pipeTo(decoder.writable);
    state.reader = decoder.readable.getReader();
    let buffer = "";
    try {
      while (true) {
        const { value, done } = await state.reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const reading = validateReading(JSON.parse(line));
            const receivedAt = new Date();
            addHistory(reading, receivedAt);
            render(reading, receivedAt);
            setConnection("connected", "เชื่อมต่อ Arduino แล้ว", "Serial · 9600 baud");
          } catch (error) {
            showToast(`ข้ามบรรทัดข้อมูล: ${error.message}`, "error");
          }
        }
        if (buffer.length > 8192) {
          buffer = "";
          showToast("ข้อมูล Serial ยาวเกินกำหนด จึงข้ามบรรทัดนี้", "error");
        }
      }
    } finally {
      if (state.reader) {
        state.reader.releaseLock();
        state.reader = null;
      }
      try {
        await closed;
      } catch (error) {
        if (error.name !== "AbortError" && error.name !== "TypeError") throw error;
      }
      if (state.serialPort === port) {
        state.serialPort = null;
        state.readTask = null;
        setConnection("error", "บอร์ดหยุดส่งข้อมูล", "ตรวจสอบสาย USB");
        showToast("การเชื่อมต่อ Serial ถูกปิด", "error");
        await port.close();
      }
    }
  }

  async function connectSerial() {
    if (!("serial" in navigator)) {
      throw new Error("เบราว์เซอร์นี้ไม่รองรับ Web Serial โปรดลอง Chrome หรือ Edge บนคอมพิวเตอร์");
    }
    if (state.serialPort) {
      await disconnectSerial();
      startDemo();
      showToast("ตัดการเชื่อมต่อ Arduino แล้ว");
      return;
    }
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate: 9600 });
    state.serialPort = port;
    state.history = [];
    state.connectionStartedAt = Date.now();
    clearReadings();
    window.clearInterval(state.demoTimer);
    state.demoTimer = null;
    setConnection("connecting", "กำลังรอข้อมูล Arduino", "Serial · 9600 baud");
    $("#online-count").textContent = "00";
    $("#online-note").textContent = "รอข้อมูล JSON จากบอร์ด";
    $("#online-meter-fill").style.width = "0%";
    state.readTask = readSerial(port).catch(async (error) => {
      if (state.serialPort) {
        setConnection("error", "การเชื่อมต่อมีปัญหา", error.message);
        showToast(`Serial: ${error.message}`, "error");
        await disconnectSerial();
      }
    });
  }

  $("#connect-serial").addEventListener("click", async () => {
    try {
      await connectSerial();
    } catch (error) {
      if (error.name === "NotFoundError") return;
      showToast(error.message || "เชื่อมต่อ Serial ไม่สำเร็จ", "error");
      if (error.name !== "SecurityError") setConnection("error", "เชื่อมต่อไม่สำเร็จ", "ตรวจสอบพอร์ต Serial");
    }
  });
  $("#refresh-data").addEventListener("click", () => {
    if (state.mode === "demo") {
      const reading = makeDemoReading();
      const time = new Date();
      addHistory(reading, time);
      render(reading, time);
      showToast("อัปเดตข้อมูลตัวอย่างแล้ว");
    } else {
      drawChart(Date.now());
      showToast("แสดงข้อมูลล่าสุดแล้ว");
    }
  });
  $("#chart-range").addEventListener("change", (event) => {
    state.rangeHours = Number(event.target.value);
    drawChart(Date.now());
  });
  $("#stage-continue").addEventListener("click", savePlantingDate);
  $("#cancel-date-edit").addEventListener("click", () => {
    if (!plantingDate) return;
    $("#stage-gate").hidden = true;
    $("#app-shell").hidden = false;
    window.scrollTo(0, 0);
    drawChart(Date.now());
  });
  $("#change-stage").addEventListener("click", showStageGate);
  $("#selected-stage-chip").addEventListener("click", showStageGate);
  ["n", "p", "k"].forEach((nutrient) => {
    $(`#status-${nutrient}`).addEventListener("change", () => updateNutrientAdvice(nutrient));
    updateNutrientAdvice(nutrient);
  });
  document.querySelectorAll(".sensor-marker").forEach((marker) => {
    marker.addEventListener("click", () => {
      if (!state.reading) {
        showToast("รอข้อมูลจากเซ็นเซอร์ก่อน");
        return;
      }
      const sensor = marker.dataset.sensor;
      const message = sensor === "chemistry"
        ? `N ${Math.round(state.reading.n)} · P ${Math.round(state.reading.p)} · K ${Math.round(state.reading.k)} · pH ${state.reading.ph.toFixed(1)}`
        : `ความชื้น ${MOISTURE_DEPTHS_CM[Number(sensor.slice(-1)) - 1]} cm: ${Math.round(state.reading.moisture[Number(sensor.slice(-1)) - 1])}%`;
      showToast(message);
    });
  });
  window.setInterval(() => {
    if (state.mode !== "connected" && state.mode !== "connecting" && state.mode !== "wifi") return;
    const lastUpdate = state.lastReadingAt?.getTime() || state.connectionStartedAt;
    if (!lastUpdate || Date.now() - lastUpdate <= STALE_AFTER_MS) return;
    const detail = state.mode === "wifi" ? "ตรวจสอบ Wi-Fi และโปรแกรมบนบอร์ด" : "ตรวจสอบสาย USB และโปรแกรมบนบอร์ด";
    setConnection("error", "ข้อมูลหยุดอัปเดต", detail);
    $("#online-count").textContent = "00";
    $("#online-note").textContent = `ข้อมูลล่าสุด ${formatTime(new Date(lastUpdate))}`;
    $("#online-meter-fill").style.width = "0%";
    document.querySelectorAll(".reading-status").forEach((status) => {
      status.textContent = "ไม่มีข้อมูล";
      status.classList.remove("low");
      status.classList.add("offline");
    });
  }, 5_000);
  window.addEventListener("resize", () => drawChart(Date.now()));
  window.addEventListener("beforeunload", () => {
    if (state.serialPort) state.serialPort.close();
  });
  $("#current-time").textContent = formatTime(new Date());
  $("#today-date").textContent = new Date().toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
  window.setInterval(() => { $("#current-time").textContent = formatTime(new Date()); }, 1_000);
  window.setInterval(pollWifi, 1_000);
  window.setInterval(updateCropStage, 60_000);
  pollWifi();
  startDemo();
  $("#planting-date").max = todayAsInputDate();
  try {
    const savedDate = localStorage.getItem(PLANTING_DATE_KEY);
    if (savedDate && isValidPlantingDate(savedDate) && savedDate <= todayAsInputDate()) {
      plantingDate = savedDate;
      updateCropStage();
      $("#stage-gate").hidden = true;
      $("#app-shell").hidden = false;
      drawChart(Date.now());
    } else {
      showStageGate();
    }
  } catch (error) {
    showStageGate();
    $("#date-error").textContent = "เบราว์เซอร์ปิดการบันทึกข้อมูลไว้ โปรดอนุญาตพื้นที่จัดเก็บเว็บไซต์เพื่อจำวันปลูก";
    $("#date-error").hidden = false;
  }
})();
