import mongoose from 'mongoose';
import { Mistral } from "@mistralai/mistralai";
import dotenv from "dotenv";
import axios from "axios";
dotenv.config();
// MongoDB connection
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error('MongoDB connection error:', err));

// MongoDB schemas
const jobSchema = new mongoose.Schema({
    title: { type: String, required: true }, // Company name is hiring role (Job title or role being offered)
    job_id: { type: Number }, // Unique identifier for the job
    role: { type: String, required: true }, // Job title or role being offered
    company: { type: String, required: true }, // Company name
    category: { type: String, required: true },
    sub_category: { type: String, required: true },
    skills: { type: [String], default: [] }, // Required skills (add based on job role if not mentioned)
    experience_min: { type: Number, default: 0 }, // Min years of experience
    experience_max: { type: Number, default: 0 }, // Max years of experience
    employment_type: { type: [String], default: [] }, // ['Fresher', 'Experienced'] based on experience
    job_type: { type: [String], default: [] }, // e.g., Remote, Full-Time
    apply_link: { type: String, required: true }, // URL to apply
    salary_min: { type: Number, default: 0 }, // Annual min salary
    salary_max: { type: Number, default: 0 }, // Annual max salary
    education: { type: [String], default: [] }, // Education qualifications
    location: { type: [String], default: [] }, // Job location(s)
    batch: { type: [String], default: [] }, // Eligible batches (calculated using experience as of 2025)
    created_at: { type: Date, default: Date.now },
    message: { type: String } // Formatted job message
});

// Create a Job model
const Job = mongoose.model('Job', jobSchema);

export async function fetchingContent(url) {
    try {
        // Add headers to mimic a real browser
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
            'Accept': 'application/json',
        };

        const response = await fetch(url, { headers: headers });

        if (!response.ok) {
            // Log the actual status text for more detail
            throw new Error(`HTTP error! status: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        if (data) {
            return data;
        } else {
            throw new Error(`Failed to decode JSON response`);
        }
    } catch (error) {
        console.error('Error fetching data: ', error);
    }
}

export async function parseContent(content, api_key) {
    try {
        for (let post in content) {
            const res = content[post]?.content?.rendered;
            if (res) {
                await generateContent(res, api_key);
            } else {
                throw new Error(`problem in parseContent`);
            }
        }
    } catch (error) {
        console.error('Error Parsing Data: ', error);
    }
}

async function generateContent(content, api_key) {
    try {
        const mistral = new Mistral({ apiKey: api_key });

        const prompt = `html_content = ${content}
        Extract and return the following details in a well-structured **MongoDB-compatible JSON format**, ensuring no unknown ASCII values are present. The JSON structure should be:
        {
            "title": "string",  # Write "company_name is hiring role" (Job title or role being offered) batch Eligible (if recent batch is mentioned, calculate using experience as of 2025)
            "job_id": NumberInt("Integer"),  # Unique identifier for the job. Extract from apply_link.
            "role": "string",  # Job title or role being offered.
            "company": "string",
            "category" : "string", # tag one out of these [Software Development, DevOps & Cloud Engineering, AI/ML, Cybersecurity , Database & Infrastructure, Testing & Quality Assurance (QA), IT Support & System Administration, Business & Product Management, UI/UX Design, Blockchain, Non-Tech]
            "sub_category": string  # Select an appropriate sub-category based on the chosen category. 
                                     # The sub-category must be one of the predefined values from the list below:
            {
              "Software Development": ["Frontend", "Backend", "Full Stack", "Android", "iOS", "Game Development", "Embedded Systems"],
              "DevOps & Cloud Engineering": ["DevOps Engineer", "Cloud Engineer", "Site Reliability Engineer (SRE)", "Kubernetes Engineer"],
              "AI/ML": ["Data Scientist", "Machine Learning Engineer", "AI Engineer", "Deep Learning Engineer"],
              "Cybersecurity": ["Cybersecurity Engineer", "Ethical Hacker", "SOC Analyst", "Security Architect"],
              "Database & Infrastructure": ["Database Administrator (DBA)", "Data Engineer", "Cloud Database Engineer"],
              "Testing & Quality Assurance (QA)": ["Manual Tester", "Automation Tester", "Performance Tester", "Security Tester"],
              "IT Support & System Administration": ["IT Support Engineer", "System Administrator", "Help Desk Technician"],
              "Business & Product Management": ["Product Development", "Business Analyst", "Scrum Master"],
              "UI/UX Design": ["UI Designer", "UX Designer", "Graphic Designer"],
              "Blockchain": ["Blockchain Developer", "Smart Contract Developer", "Web3 Engineer"],
              "Non-Tech": ["Tech Recruiter", "IT Sales", "Technical Writer"],
              "Other": "Other"
            }
            "skills": ["string"],  # Required skills for the job. (If not mentioned in html_content, add according to job role)
            "experience_min": NumberInt("Integer"),  # Minimum years of experience required.
            "experience_max": NumberInt("Integer"),  # Maximum years of experience required.
            "employment_type": ["string"],  # List indicating job type, e.g., ["Fresher", "Experienced"]. Determine based on experience_min and experience_max:
            # - If both are 0, classify as Fresher.
            # - If experience_min > 0, classify as Experienced.
            # - If experience_min = 0 and experience_max > 0, include both Fresher and Experienced.
            "job_type": ["string"],  # Nature of employment, e.g., Remote, Full-Time.
            "apply_link": "string",  # URL link to apply for the job.
            "salary_min": NumberInt("Integer"),  # Annual minimum salary (convert monthly to annual if needed).
            "salary_max": NumberInt("Integer"),  # Annual maximum salary (convert monthly to annual if needed).
            "education": ["string"],  # Education qualifications required for the job.
            "location": ["string"],  # Job location.
            "batch": ["string"],  # Eligible batches (if recent batch is mentioned, calculate using experience as of 2025).
            "message": "string"  # Generate a formatted message as follows:
    
            # Format:
            # This message has been sent by a bot.
        #
        # {company} is Hiring! 🚀
        #
        # 💼 Role: {role}
        # 📍 Location: {location}
        # 💰 Salary Range: ₹{salary_min} - ₹{salary_max} per year
        #
        # ✨ Eligibility:
            # - {education}
        # - Batch: {batch}
        # - Experience: {experience_min} - {experience_max} years (if both 0 then just add 0)
        #
        # 🛠 Skills:
            # - {skills}, {skills}, {skills}
            # - {skills}, {skills}, {skills}
        #
        # 📄 View Full Job Details & Apply: {apply_link}
        }
        `;

        const response = await mistral.chat.complete({
            model: "mistral-small-latest",
            messages: [{ role: "user", content: prompt }],
        });

        let textOutput = null;
        if (response?.choices && response.choices.length > 0) {
            textOutput = response.choices[0].message?.content ?? response.choices[0].text ?? response.choices[0];
        } else if (typeof response === 'string') {
            textOutput = response;
        } else if (response && response.output) {
            textOutput = response.output[0]?.content?.[0]?.text ?? JSON.stringify(response);
        } else {
            textOutput = JSON.stringify(response);
        }

        const startIdx = textOutput.indexOf('{');
        const endIdx = textOutput.lastIndexOf('}');
        if (startIdx === -1 || endIdx === -1) {
            throw new Error('Could not extract JSON object from model output');
        }
        const jsonStr = textOutput.slice(startIdx, endIdx + 1);
        const parsed = JSON.parse(jsonStr);
        await saveJob(parsed);
    } catch (error) {
        console.error('Error in generateContent:', error);
    }
}

async function saveJob(data) {
    try {
        if (typeof data !== 'object' || data === null) {
            throw new Error("Invalid data format: Data must be an object");
        }
        const url = data['apply_link'].split('&')[0];
        if (await checkLink(url)) {
            data['apply_link'] = url;
        }
        const existData = await Job.findOne({
            apply_link: data.apply_link
        });
        const existData2 = await Job.findOne({
            company: data.company,
            role: data.role
        });
        const existData3 = await Job.findOne({
            company: data.company,
            category: data.category,
            sub_category: data.sub_category
        });
        if (existData || existData2 || existData3) {
            console.log("Job already exists in the database");
            return;
        }
        const jobDetails = new Job({ ...data });
        await jobDetails.save();
        console.log("Job saved successfully!");
    } catch (error) {
        console.error("Error saving job:", error.message);
    }
}

export async function deleteJobs() {
    try {
        const twoMonthAgo = new Date();
        twoMonthAgo.setMonth(twoMonthAgo.getMonth() - 2);
        const oldJobs = await Job.deleteMany({ created_at: { $lt: twoMonthAgo } });
        console.log(`Deleted ${oldJobs} old jobs.`);
        await mongoose.connection.close();
        console.log("MongoDB connection closed.");
    }
    catch (error) {
        console.error("Error in deleteJobs:", error.message);
    }
}


async function checkLink(url) {
    try {
        const response = await axios.get(url, { timeout: 2000 });
        return response.status >= 200 && response.status < 400;
    } catch (error) {
        return false;
    }
}
