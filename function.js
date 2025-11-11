import mongoose from "mongoose";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

// -------------------- MONGODB CONNECTION --------------------
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// -------------------- SCHEMA --------------------
const jobSchema = new mongoose.Schema({
  title: { type: String, required: true },
  job_id: { type: Number },
  role: { type: String, required: true },
  company: { type: String, required: true },
  category: { type: String, required: true },
  sub_category: { type: String, required: true },
  skills: { type: [String], default: [] },
  experience_min: { type: Number, default: 0 },
  experience_max: { type: Number, default: 0 },
  employment_type: { type: [String], default: [] },
  job_type: { type: [String], default: [] },
  apply_link: { type: String, required: true },
  salary_min: { type: Number, default: 0 },
  salary_max: { type: Number, default: 0 },
  education: { type: [String], default: [] },
  location: { type: [String], default: [] },
  batch: { type: [String], default: [] },
  created_at: { type: Date, default: Date.now },
  message: { type: String }
});

const Job = mongoose.model("Job", jobSchema);

// -------------------- FETCH CONTENT --------------------
export async function fetchingContent(url) {
  try {
    const response = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; JobScraperBot/1.0; +https://yourdomain.com)",
        "Accept": "application/json, text/plain, */*"
      },
      timeout: 15000
    });

    if (response.status >= 200 && response.status < 300) {
      return response.data;
    } else {
      throw new Error(`HTTP Error: ${response.status}`);
    }
  } catch (error) {
    console.error(`❌ Error fetching data from ${url}:`, error.message);
    return null;
  }
}

// -------------------- PARSE CONTENT --------------------
export async function parseContent(content, api_key) {
  try {
    for (let post of content) {
      const res = post?.content?.rendered;
      if (res) {
        await generateContent(res, api_key);
      } else {
        console.warn("⚠️ Skipping post — no valid HTML content found.");
      }
    }
  } catch (error) {
    console.error("❌ Error Parsing Data:", error.message);
  }
}

// -------------------- GENERATE CONTENT (Gemini API) --------------------
async function generateContent(content, api_key) {
  try {
    if (!api_key) throw new Error("Missing Google Generative AI API key");

    const genAI = new GoogleGenerativeAI(api_key);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const prompt = `
Extract and return job details from the HTML below in **valid JSON** (MongoDB-compatible). 
Ensure no markdown, comments, or formatting — only pure JSON.

HTML_CONTENT:
${content}
`;

    const result = await model.generateContent(prompt);
    const raw = await result.response.text();

    // Clean Gemini’s markdown or extra formatting
    const cleanText = raw
      .replace(/^```json\s*/i, "")
      .replace(/```$/i, "")
      .trim();

    let data;
    try {
      data = JSON.parse(cleanText);
    } catch (err) {
      console.error("❌ Gemini output not JSON. Raw output:\n", cleanText);
      return;
    }

    await saveJob(data);
  } catch (error) {
    console.error("❌ Error generating content:", error.message);
  }
}

// -------------------- SAVE JOB TO DATABASE --------------------
async function saveJob(data) {
  try {
    if (!data || typeof data !== "object") {
      throw new Error("Invalid data format: must be a JSON object");
    }

    // Clean apply_link
    const url = data["apply_link"]?.split("&")[0] || "";
    if (await checkLink(url)) data["apply_link"] = url;

    // Check for duplicates
    const exists = await Job.findOne({
      $or: [
        { apply_link: data.apply_link },
        { company: data.company, role: data.role },
        {
          company: data.company,
          category: data.category,
          sub_category: data.sub_category
        }
      ]
    });

    if (exists) {
      console.log("⚠️ Job already exists in the database");
      return;
    }

    const jobDetails = new Job({ ...data });
    await jobDetails.save();
    console.log("✅ Job saved successfully!");
  } catch (error) {
    console.error("❌ Error saving job:", error.message);
  }
}

// -------------------- DELETE OLD JOBS --------------------
export async function deleteJobs() {
  try {
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

    const result = await Job.deleteMany({ created_at: { $lt: twoMonthsAgo } });
    console.log(`🗑️ Deleted ${result.deletedCount} old jobs.`);

    await mongoose.connection.close();
    console.log("🔒 MongoDB connection closed.");
  } catch (error) {
    console.error("❌ Error in deleteJobs:", error.message);
  }
}

// -------------------- VALIDATE APPLY LINK --------------------
async function checkLink(url) {
  if (!url) return false;
  try {
    const response = await axios.get(url, { timeout: 8000 });
    return response.status >= 200 && response.status < 400;
  } catch {
    return false;
  }
}

// -------------------- GLOBAL ERROR HANDLERS --------------------
process.on("unhandledRejection", (err) =>
  console.error("🚨 Unhandled Rejection:", err)
);
process.on("uncaughtException", (err) =>
  console.error("🚨 Uncaught Exception:", err)
);
