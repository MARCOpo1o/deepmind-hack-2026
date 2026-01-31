
import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult } from "../types.ts";

export const analyzeVideo = async (videoBase64: string, mimeType: string): Promise<AnalysisResult> => {
  console.log("[Clip3 AI] Starting deep analysis...");
  
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelName = 'gemini-3-pro-preview';

  const systemInstruction = `
    You are an elite sports broadcast analyst. 
    Analyze the provided video and identify every significant scoring event.
    
    For each event, you MUST identify:
    1. timestampSeconds: The float timestamp of the score.
    2. displayTime: MM:SS format.
    3. description: A 1-sentence exciting description.
    4. scoreType: e.g. 'Goal', '3-Pointer', 'Touchdown'.
    5. intensity: 'High', 'Medium', or 'Low'.
    6. playerJerseyNumber: THE MOST IMPORTANT PART. Identify the jersey number of the player who scored. 
       Look closely at their back or chest during the celebration or the play. 
       Return just the number (e.g. "10", "7", "23"). 
       If absolutely impossible to see, return "Unknown".
    
    Return the data strictly as a single JSON object.
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: mimeType,
                data: videoBase64
              }
            },
            { text: "Identify all scores and the jersey numbers of the scorers in JSON format." }
          ]
        }
      ],
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
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
                required: ["timestampSeconds", "displayTime", "description", "scoreType", "intensity", "playerJerseyNumber"],
                propertyOrdering: ["timestampSeconds", "displayTime", "description", "scoreType", "intensity", "playerJerseyNumber"]
              }
            },
            summary: { type: Type.STRING }
          },
          required: ["highlights", "summary"],
          propertyOrdering: ["highlights", "summary"]
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
    if (error.message?.includes("400")) {
      throw new Error("Video too large or format unsupported. Try a smaller clip.");
    }
    throw error;
  }
};

export const queryVideo = async (videoBase64: string, mimeType: string, query: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelName = 'gemini-3-pro-preview';

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [
        {
          parts: [
            { inlineData: { mimeType, data: videoBase64 } },
            { text: query }
          ]
        }
      ],
      config: {
        systemInstruction: "You are an AI sports analyst. Be concise.",
        maxOutputTokens: 1024,
        thinkingConfig: { thinkingBudget: 512 }
      }
    });
    return response.text || "No insights.";
  } catch (error: any) {
    if (error.message?.includes("Requested entity was not found")) {
      if ((window as any).aistudio?.openSelectKey) {
        (window as any).aistudio.openSelectKey();
      }
    }
    throw error;
  }
};
