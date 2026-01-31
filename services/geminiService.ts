import { GoogleGenAI, Type } from "@google/genai";
import { GradingModel, GradingResult } from "../types";

// Initialize the API client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Helper to convert a Browser File object to Base64 string
 */
export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // Remove the Data URL prefix (e.g., "data:image/jpeg;base64,")
      const base64Data = result.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = (error) => reject(error);
  });
};

/**
 * Grades a student submission (potentially multiple pages) against a reference key.
 */
export const gradeSubmission = async (
  referenceFile: File,
  studentFiles: File[],
  modelName: GradingModel
): Promise<GradingResult> => {
  try {
    const referenceBase64 = await fileToBase64(referenceFile);
    
    // Convert all student pages to base64 parts
    const studentImageParts = await Promise.all(
      studentFiles.map(async (file) => ({
        inlineData: {
          mimeType: file.type,
          data: await fileToBase64(file),
        },
      }))
    );

    const prompt = `
      You are a strict and precise exam grader.
      
      CONTEXT:
      - The student submission consists of one or more image pages. 
      - The exam is split into two parts: Page 1 covers questions 1-50, and Page 2 covers questions 51-100 (if present).
      - Treat all provided student images as a SINGLE exam submission.

      STRICT GRADING RULES (OCR):
      1. **V-Check Only**: Identify the student's selected answer based **ONLY** on a 'V' checkmark (e.g., ✔, v). 
      2. **Capture Answer**: Return the specific option number/text marked (e.g., "1", "2", "3", "4", "5").
      3. **Exceptions**:
         - If no 'V' is found, return "X" (Unanswered).
         - If multiple 'V's are found on one question, return "Multi".
      4. **Ignore Others**: Completely IGNORE circles (O), cross-outs (X), underlines, dots, or fully filled boxes. These do not count as answers.
      5. If a 'V' is ambiguous, mark it as 0 score.

      TASK:
      1. Analyze the 'Reference Answer Key' (first image).
      2. Grade the 'Student Submission' images against this key using the rules above.
      3. Extract the student's identifying information:
         - **Name**: Extract the student's name. If not found, use "이름 없음".
         - **Class/Grade**: Extract class, grade, or section info (e.g., "Class A", "3-2"). If not found, return empty string.
      4. Provide for each question:
         - The score (1 or 0 usually, or partial).
         - The **student's answer** (what they marked).
         - A reason.
      5. Calculate the total score.

      LANGUAGE:
      - **Feedback must be written in Korean (한국어).**
      - Reasons for scores can be brief.

      Output must be strictly in JSON format matching the schema.
    `;

    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: referenceFile.type,
              data: referenceBase64,
            },
          },
          ...studentImageParts, // Spread all student pages here
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            student_name: { type: Type.STRING },
            student_class: { type: Type.STRING },
            total_score: { type: Type.NUMBER },
            feedback: { type: Type.STRING },
            scores: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  q_num: { type: Type.NUMBER },
                  score: { type: Type.NUMBER },
                  student_answer: { type: Type.STRING, description: "The option marked by the student (e.g. '3', 'X')" },
                  reason: { type: Type.STRING },
                },
              },
            },
          },
          required: ["student_name", "total_score", "scores", "feedback"],
        },
      },
    });

    if (response.text) {
      try {
        const rawResult = JSON.parse(response.text);

        // Robustness check for OCR errors
        let hasOCRIssues = false;

        let student_name = rawResult.student_name;
        if (!student_name || typeof student_name !== 'string' || student_name.trim() === '') {
            console.warn("OCR Warning: Student name missing or empty in model response. Defaulting to '이름 없음'.");
            student_name = "이름 없음";
            hasOCRIssues = true;
        }

        let student_class = rawResult.student_class;
        // Check if missing or empty. If the model returns an empty string or nothing, default to "반 정보 없음" 
        // to make it visible and editable in the UI.
        if (!student_class || typeof student_class !== 'string' || student_class.trim() === '') {
             console.warn("OCR Warning: Student class field missing or empty. Defaulting to '반 정보 없음'.");
             student_class = "반 정보 없음";
             hasOCRIssues = true;
        }

        // Ensure robust return object
        return {
            student_name,
            student_class,
            total_score: typeof rawResult.total_score === 'number' ? rawResult.total_score : 0,
            feedback: rawResult.feedback || "피드백이 없습니다.",
            scores: Array.isArray(rawResult.scores) ? rawResult.scores : [],
            hasOCRIssues
        } as GradingResult;

      } catch (parseError) {
        console.error("JSON Parse Error:", parseError);
        throw new Error("Failed to parse grading results from model response.");
      }
    } else {
      throw new Error("Empty response from model");
    }
  } catch (error) {
    console.error("Grading error:", error);
    throw error;
  }
};