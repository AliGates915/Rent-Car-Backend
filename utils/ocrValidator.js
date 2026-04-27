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

    // 🔥 FIXED: Use else if to prevent fall-through
    if (type === "cnic_back") {
      text = await extractTextWithGoogle(processedPath);
      text = text.toLowerCase();
      confidence = 95;

      // DEBUG: Log full extracted text
      console.log("=== FULL EXTRACTED TEXT ===");
      console.log(text);
      console.log("===========================");

      // Check if the lost card text exists in any form
      const lostCardPartial = "گم شدہ کارڈ";
      if (text.includes(lostCardPartial)) {
        console.log("✅ Found partial lost card text!");
      } else {
        console.log("❌ No lost card text found at all");
      }
    }
    else if (type === "cnic_front") {
      text = await extractTextWithGoogle(processedPath);
      text = text.toLowerCase();
      confidence = 95;
      console.log("🔍 CNIC FRONT - Using Google OCR");
    }
    else {
      const result = await Tesseract.recognize(processedPath, "urd+eng");
      text = result.data.text.toLowerCase();
      confidence = result.data.confidence;
      console.log("🔍 OTHER DOCUMENT - Using Tesseract OCR");
    }

    console.log("📝 Extracted Text Sample:", text.substring(0, 200));
    console.log("📊 Confidence:", confidence);

    const wordCount = text.split(/\s+/).length;

    // ----------------------------
    // 🔥 LOW TEXT (DON'T BLOCK USER)
    // ----------------------------
    if (!text || wordCount < 5) {
      console.log("❌ Low readable text detected");
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
    } catch { }
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
  let reasons = [];

  // Check for key words instead of exact phrase
  const requiredWords = [
    "گم",           // Lost
    "شدہ",          // (part of lost)
    "کارڈ",         // Card
    "ملنے",         // Found
    "پر",           // On/upon
    "بکس"           // Box
  ];
  
  const wordMatchCount = requiredWords.filter(word => text.includes(word)).length;
  const hasLostCardContext = wordMatchCount >= 4; // At least 4 key words match
  
  if (hasLostCardContext) {
    score += 35;
    console.log(`✅ Lost card context found (${wordMatchCount}/6 words matched)`);
  } else {
    console.log(`⚠️ Lost card context weak (${wordMatchCount}/6 words matched)`);
    reasons.push("Lost card text incomplete");
  }

  // Check for CNIC number
  const hasNumber = 
    /\d{5}-\d{7}-\d/.test(text) || 
    /\d{13}-\d/.test(text);
  
  if (hasNumber) {
    score += 30;
    console.log("✅ CNIC number found");
  } else {
    reasons.push("CNIC number missing");
  }

  if (text.length > 50) {
    score += 10;
    console.log("✅ Sufficient text length");
  }

  console.log("FINAL SCORE:", score);
  console.log("Reasons:", reasons);

  if (score >= 40) {
    return {
      isValid: true,
      extractedText: text,
      warnings: reasons.length > 0 ? reasons : null
    };
  }

  return fail(`Invalid CNIC Back - Score: ${score}, Reasons: ${reasons.join(", ")}`);
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

  if (hasLicenseWords || hasAuthority || hasProvince || hasFields) {
    return success();
  }

  return fail("Invalid Driving License");
};
