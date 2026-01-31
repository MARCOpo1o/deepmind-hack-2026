
import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult } from "../types.ts";

export const analyzeVideo = async (parts: any[]): Promise<AnalysisResult> => {
  console.log("[Clip3 AI] Analyzing sampled match frames...");
  
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelName = 'gemini-3-flash-preview';

  const systemInstruction = `
    You are an elite sports broadcast analyst. 
    You will be provided with a sequence of frames sampled from a sports video.
    
    TASK:
    1. Identify every scoring event visible in the frames.
    2. Provide an accurate timestamp for each score.
    3. Identify the jersey number of the player who scored.
    4. Provide an exciting description of the play.
    
    JSON SCHEMA REQUIREMENTS:
    - highlights: array of objects
      - timestampSeconds: float (the actual time in the video)
      - displayTime: MM:SS format
      - description: 1-sentence highlight description
      - scoreType: e.g. 'Goal', '3-Pointer', 'Touchdown'
      - intensity: 'High', 'Medium', or 'Low'
      - playerJerseyNumber: the scorer's jersey number (e.g. "7", "23") or "Unknown"
    - summary: a brief match summary
    
    Return ONLY a single valid JSON object.
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: [
          ...parts,
          { text: "Examine these frames sequentially and find all scoring moments. Return the results in JSON format." }
        ]
      },
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 2048 },
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            highlights: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  timestampSeconds: { type: Type.NUMBER },
                  displayTime: { type: Type.STRING },
                  description: { type: Type.STRING },
                  scoreType: { type: Type.STRING },
                  intensity: { type: Type.STRING },
                  playerJerseyNumber: { type: Type.STRING }
                },
                required: ["timestampSeconds", "displayTime", "description", "scoreType", "intensity", "playerJerseyNumber"]
              }
            },
            summary: { type: Type.STRING }
          },
          required: ["highlights", "summary"]
        }
      }
    });

    const resultText = response.text;
    if (!resultText) throw new Error("The AI returned an empty response.");

    const parsed = JSON.parse(resultText);
    return parsed as AnalysisResult;

  } catch (error: any) {
    console.error("[Clip3 AI] API Error:", error);
    
    if (error.message?.includes("Requested entity was not found")) {
      if ((window as any).aistudio?.openSelectKey) {
        (window as any).aistudio.openSelectKey();
      }
    }
    
    throw error;
  }
};
