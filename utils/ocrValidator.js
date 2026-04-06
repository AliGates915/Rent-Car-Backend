import Tesseract from "tesseract.js";
import sharp from "sharp";
import path from "path";
import fs from "fs";
import axios from "axios";
import vision from "@google-cloud/vision";

const visionClient = new vision.ImageAnnotatorClient({
  keyFilename: path.join("config", "google-vision.json"),
});

const extractTextWithGoogle = async (imagePath) => {
  try {
    const [result] = await visionClient.textDetection({
      image: { source: { filename: imagePath } },
      imageContext: {
        languageHints: ["ur", "en"], // 🔥 IMPORTANT
      },
    });

    return result.textAnnotations[0]?.description || "";
  } catch (err) {
    console.log("❌ Google OCR Error:", err);
    return "";
  }
};
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
    .resize(1200) // 🔥 improve OCR
    .modulate({ brightness: 1.2, saturation: 1.3 })
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


const hasBarcodeLikePattern = async (imagePath) => {
  const { data, info } = await sharp(imagePath)
    .greyscale()
    .resize(1200)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;

  // sirf bottom area scan karo (barcode wahi hota hai)
  const startY = Math.floor(height * 0.7);

  let transitions = 0;

  for (let y = startY; y < height; y += 5) {
    let prev = null;

    for (let x = 0; x < width; x++) {
      const val = data[y * width + x];

      const current = val < 100 ? 1 : 0;

      if (prev !== null && prev !== current) {
        transitions++;
      }

      prev = current;
    }
  }

  return {
    hasBarcode: transitions > 500, // tweak if needed
    transitions,
  };
};


const detectGreenDominance = async (imagePath) => {
  const { data, info } = await sharp(imagePath)
    .resize(300)
    .raw()
    .toBuffer({ resolveWithObject: true });

  let greenish = 0;

  for (let i = 0; i < data.length; i += 3) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    if (g > r + 10 && g > b + 10) {
      greenish++;
    }
  }

  const total = info.width * info.height;
  const ratio = greenish / total;

  return {
    isGreenish: ratio > 0.2,
    ratio,
  };
};



const hasAny = (text, words) => words.some((w) => text.includes(w));

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

  console.log("FILE:", type);
  console.log("FILE URL:", fileUrl);

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

    let text = "";
    let confidence = 0;

    if (type === "cnic_back") {
      text = await extractTextWithGoogle(processedPath);
      text = text.toLowerCase();
      confidence = 95;
    }
    if (type === "cnic_front") {
      text = await extractTextWithGoogle(processedPath);
      text = text.toLowerCase();
      confidence = 95;
    } else {
      const result = await Tesseract.recognize(processedPath, "urd+eng");
      text = result.data.text.toLowerCase();
      confidence = result.data.confidence;
    }

    const wordCount = text.split(/\s+/).length;

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
      const result = await validateCNICBack(processedPath, text);
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
      reason: "Invalid document",
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
      if (processedPath && fs.existsSync(processedPath))
        fs.unlinkSync(processedPath);
    } catch {}
  }
};

// ----------------------------
// 🔵 CNIC FRONT
// ----------------------------
const validateCNICFront = (text) => {
  const normalized = text.replace(/\s+/g, " ").toLowerCase().trim();

  // console.log("CNIC FRONT TEXT:", normalized);

  // 🔢 CNIC NUMBER
  const hasNumber =
    /\d{5}-\d{7}-\d/.test(normalized) || /\d{13}/.test(normalized);

  // 🔤 KEYWORDS (flexible)
  const keywords = [
    "pakistan",
    "identity",
    "identlty", // OCR error tolerance
    "national",
    "card",
    "name",
    "father",
    "husband",
  ];

  const urduKeywords = ["پاکستان", "شناختی", "قومی", "کارڈ", "نام", "ولد"];
  const hasDOB = normalized.includes("birth") || normalized.includes("تاریخ");

  const matchScore =
    keywords.filter((k) => normalized.includes(k)).length +
    urduKeywords.filter((k) => normalized.includes(k)).length;

  console.log("Match Score:", matchScore);

  // 🔥 FINAL RULE
  if (hasNumber && matchScore >= 3 && hasDOB) {
    return success();
  }

  return fail("Invalid CNIC Front");
};

// ----------------------------
// 🔵 CNIC BACK
// ----------------------------
const validateCNICBack = async (imagePath, text) => {
  let score = 0;

  const hasNumber =
    /\d{5}-\d{7}-\d/.test(text) ||
    /\d{13}/.test(text);

  if (hasNumber) score += 15;

  const barcode = await hasBarcodeLikePattern(imagePath);
  // console.log("BARCODE:", barcode);

  if (barcode.hasBarcode) score += 40;

  const green = await detectGreenDominance(imagePath);
  // console.log("GREEN:", green);

  if (green.isGreenish) score += 20;

  if (text.length > 20) score += 5;

  console.log("FINAL SCORE:", score);

  if (score >= 50) return success();

  return fail("Invalid CNIC Back");
};

// ----------------------------
// 🔵 DRIVING LICENSE
// ----------------------------
const validateLicense = (text) => {
  const hasLicenseWords =
    hasAny(text, ["driving"]) && hasAny(text, ["license", "licence"]);

  const hasAuthority = hasAny(text, ["traffic police", "licensing authority"]);

  const hasProvince = hasAny(text, ["punjab", "sindh", "kpk", "balochistan"]);

  const hasFields = hasAny(text, ["name", "cnic", "birth", "issue", "expiry"]);

  if (hasLicenseWords && hasAuthority && hasProvince && hasFields) {
    return success();
  }

  return fail("Invalid Driving License");
};
