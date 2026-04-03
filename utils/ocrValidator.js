import Tesseract from "tesseract.js";
import sharp from "sharp";
import path from "path";
import fs from "fs";
import axios from "axios";

// ----------------------------
// 📥 DOWNLOAD IMAGE
// ----------------------------
const downloadImage = async (url, outputPath) => {
  const response = await axios({
    method: "GET",
    url,
    responseType: "stream",
  });

  const writer = fs.createWriteStream(outputPath);
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
};

// ----------------------------
// 🧠 PREPROCESS IMAGE
// ----------------------------
const preprocessImage = async (imagePath) => {
  const processedPath = imagePath.replace(".jpg", "_processed.jpg");

  await sharp(imagePath)
    .grayscale()
    .normalize()
    .sharpen()
    .toFile(processedPath);

  return processedPath;
};

// ----------------------------
// 🔥 HELPERS
// ----------------------------
const success = () => ({
  isValid: true,
  reason: null,
});

const fail = (reason) => ({
  isValid: false,
  reason,
});

const hasAny = (text, words) =>
  words.some((w) => text.includes(w));

// ----------------------------
// 🟢 FILE VALIDATION
// ----------------------------
export const validateFile = (file) => {
  const allowed = ["image/jpeg", "image/png", "image/webp"];

  if (!allowed.includes(file.mimetype)) {
    return "Only image files allowed";
  }

  if (file.size > 2 * 1024 * 1024) {
    return "File too large (max 2MB)";
  }

  return null;
};

// ----------------------------
// 🔥 MAIN VALIDATOR
// ----------------------------
export const validateDocument = async (fileUrl, type) => {
  let tempPath = null;
  let processedPath = null;
    console.log("Type", type);
    
  try {
    const fileName = `temp_${Date.now()}.jpg`;
    tempPath = path.join("temp", fileName);

    if (!fs.existsSync("temp")) {
      fs.mkdirSync("temp");
    }

    // 📥 download
    await downloadImage(fileUrl, tempPath);

    // 🧠 preprocess
    processedPath = await preprocessImage(tempPath);

    // 🔍 OCR TRY
    let text = "";
    let confidence = 0;

    try {
      const result = await Tesseract.recognize(processedPath, "eng");
      text = result.data.text.toLowerCase();
      confidence = result.data.confidence;
    } catch (err) {
      console.log("⚠️ OCR failed → fallback mode");
      return fail("Invalid or unrecognized document");
    }

    const wordCount = text.split(/\s+/).length;

    console.log("OCR TEXT:", text);
    console.log("Confidence:", confidence);

    // ----------------------------
    // 🔥 LOW TEXT (DON'T BLOCK USER)
    // ----------------------------
   if (!text || wordCount < 5) {
  return fail("Low readable text");
}

    // ----------------------------
    // 🔥 DOCUMENT VALIDATION
    // ----------------------------
    if (type === "cnic_front") {
      const result = validateCNICFront(text);
      if (result.isValid) return result;
    }

    if (type === "cnic_back") {
      const result = validateCNICBack(text);
      if (result.isValid) return result;
    }

    if (type === "driving_license") {
      const result = validateLicense(text);
      if (result.isValid) return result;
    }

    // ----------------------------
    // 🔥 BLACKLIST (STRICT)
    // ----------------------------
    const blacklist = [
      "course",
      "certificate",
      "udemy",
      "toyota",
      "honda",
      "engine",
      "model",
    ];

    const hits = blacklist.filter((w) => text.includes(w));

    if (hits.length >= 2) {
      return fail("Invalid image (not a document)");
    }

    // ----------------------------
    // ⚠️ UNKNOWN CASE → ALLOW (SMART)
    // ----------------------------
    return {
      isValid: false,
      reason: "Unclear document (allowed, review recommended)",
    };

  } catch (err) {
    console.error("OCR ERROR:", err);

    return {
      isValid: false,
      reason: "OCR crash but allowed",
    };
  } finally {
    try {
      if (tempPath && fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      if (processedPath && fs.existsSync(processedPath)) fs.unlinkSync(processedPath);
    } catch {}
  }
};

// ----------------------------
// 🔵 CNIC FRONT
// ----------------------------
const validateCNICFront = (text) => {
  const hasNumber =
    /\d{5}-\d{7}-\d/.test(text) || /\d{13}/.test(text);

  const english = [
    "pakistan",
    "identity",
    "national",
    "card",
    "name",
    "father",
  ];

  const urdu = [
    "پاکستان",
    "شناختی",
    "قومی",
    "کارڈ",
    "نام",
    "ولد",
  ];

  const hasEnglish = hasAny(text, english);
  const hasUrdu = hasAny(text, urdu);

  if (hasNumber && (hasEnglish || hasUrdu)) {
    return success();
  }

  return fail("Invalid CNIC Front");
};

// ----------------------------
// 🔵 CNIC BACK
// ----------------------------
const validateCNICBack = (text) => {
  const hasNumber =
    /\d{5}-\d{7}-\d/.test(text) || /\d{13}/.test(text);

  if (hasNumber) return success();

  const english = ["pakistan", "national", "address"];
  const urdu = ["پاکستان", "شناختی", "کارڈ", "پتہ"];

  if (hasAny(text, english) || hasAny(text, urdu)) {
    return success();
  }

  return fail("Invalid CNIC Back");
};

// ----------------------------
// 🔵 DRIVING LICENSE
// ----------------------------
const validateLicense = (text) => {
  // 🔥 KEYWORDS (STRONG)
  const hasLicenseWords =
    text.includes("driving") &&
    text.includes("license");

   
    
  // 🔥 AUTHORITY CHECK (VERY IMPORTANT)
  const hasAuthority =
    text.includes("traffic police") ||
    text.includes("licensing authority");

  // 🔥 PROVINCE
  const hasProvince =
    text.includes("punjab") ||
    text.includes("sindh") ||
    text.includes("kpk") ||
    text.includes("balochistan");

  // 🔥 STRUCTURE CHECK (NEW)
  const hasFields =
    text.includes("name") ||
    text.includes("cnic") ||
    text.includes("birth") ||
    text.includes("issue") ||
    text.includes("expiry");


    // console.log("hasLicenseWords ", hasLicenseWords);
    // console.log("hasAuthority ", hasAuthority);
    // console.log("hasProvince ", hasProvince);
    // console.log("hasFields ", hasFields);
    
  // 🔥 FINAL LOGIC
  if (
    hasLicenseWords &&
    hasAuthority &&
    hasProvince &&
    hasFields
  ) {
    return success();
  }

  return fail("Invalid Driving License");
};