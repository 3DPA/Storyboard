import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { google } from "googleapis";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route for Google Doc Export
  app.post("/api/export/google-doc", async (req, res) => {
    const { accessToken, scenes, documentId: existingDocumentId } = req.body;

    if (!accessToken) {
      return res.status(400).json({ error: "Access token is required" });
    }

    try {
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: accessToken });

      const docs = google.docs({ version: "v1", auth });

      let documentId = existingDocumentId;

      // 1. Create a new document if one doesn't exist
      if (!documentId) {
        const createResponse = await docs.documents.create({
          requestBody: {
            title: `Storyboard Progress - ${new Date().toLocaleDateString()}`,
          },
        });
        documentId = createResponse.data.documentId;
      } else {
        // If it exists, we might want to clear it or just append.
        // For "Save Progress", appending or replacing is fine. 
        // Let's try to replace content by getting the end index.
        try {
          const doc = await docs.documents.get({ documentId });
          const content = doc.data.body?.content || [];
          const endIndex = content[content.length - 1]?.endIndex || 1;
          
          // Clear existing content if updating
          if (endIndex > 2) {
            await docs.documents.batchUpdate({
              documentId,
              requestBody: {
                requests: [{
                  deleteContentRange: {
                    range: { startIndex: 1, endIndex: endIndex - 1 }
                  }
                }]
              }
            });
          }
        } catch (err) {
          // If documentId is invalid, create a new one
          const createResponse = await docs.documents.create({
            requestBody: {
              title: `Storyboard Progress - ${new Date().toLocaleDateString()}`,
            },
          });
          documentId = createResponse.data.documentId;
        }
      }

      if (!documentId) throw new Error("Failed to create or find document");

      // 2. Prepare content updates
      const requests = [
        {
          insertText: {
            location: { index: 1 },
            text: "STORYBOARD PROGRESS\n\n",
          },
        },
        {
          updateParagraphStyle: {
            range: { startIndex: 1, endIndex: 20 },
            paragraphStyle: { namedStyleType: "TITLE", alignment: "CENTER" },
            fields: "namedStyleType,alignment",
          },
        },
      ];

      let currentIndex = 21;
      const sortedScenes = Object.entries(scenes as Record<string, any>)
        .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));

      for (const [id, data] of sortedScenes) {
        const sceneTitle = `${data.title || id.replace("_", " ").toUpperCase()}\n`;
        const visualText = `Visual: ${data.visual || "(empty)"}\n`;
        const narrationText = `Narration: ${data.narration || "(empty)"}\n\n`;

        requests.push(
          {
            insertText: {
              location: { index: currentIndex },
              text: sceneTitle,
            },
          },
          {
            updateParagraphStyle: {
              range: { startIndex: currentIndex, endIndex: currentIndex + sceneTitle.length },
              paragraphStyle: { namedStyleType: "HEADING_1", alignment: "START" },
              fields: "namedStyleType,alignment",
            },
          }
        );
        currentIndex += sceneTitle.length;

        requests.push({
          insertText: {
            location: { index: currentIndex },
            text: visualText,
          },
        });
        currentIndex += visualText.length;

        requests.push({
          insertText: {
            location: { index: currentIndex },
            text: narrationText,
          },
        });
        currentIndex += narrationText.length;
      }

      // 3. Apply updates
      await docs.documents.batchUpdate({
        documentId,
        requestBody: { requests },
      });

      res.json({
        success: true,
        documentId,
        url: `https://docs.google.com/document/d/${documentId}/edit`,
      });
    } catch (error: any) {
      console.error("Google Docs Export Error:", error);
      res.status(500).json({ error: error.message || "Failed to export to Google Docs" });
    }
  });

  // API Route for Google Slides Export
  app.post("/api/export/google-slides", async (req, res) => {
    const { accessToken, scenes } = req.body;

    if (!accessToken) {
      return res.status(400).json({ error: "Access token is required" });
    }

    try {
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: accessToken });

      const slides = google.slides({ version: "v1", auth });

      // 1. Create a new presentation
      const createResponse = await slides.presentations.create({
        requestBody: {
          title: `Storyboard Presentation - ${new Date().toLocaleDateString()}`,
        },
      });

      const presentationId = createResponse.data.presentationId;
      if (!presentationId) throw new Error("Failed to create presentation");

      const requests: any[] = [];
      const sortedScenes = Object.entries(scenes as Record<string, any>)
        .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));

      // 2. Add slides for each scene
      sortedScenes.forEach(([id, data], index) => {
        const slideId = `slide_${index}`;
        const titleId = `title_${index}`;
        const bodyId = `body_${index}`;

        requests.push(
          {
            createSlide: {
              objectId: slideId,
              insertionIndex: index + 1,
              slideLayoutReference: { predefinedLayout: "BLANK" },
            },
          },
          {
            createShape: {
              objectId: titleId,
              shapeType: "TEXT_BOX",
              elementProperties: {
                pageObjectId: slideId,
                size: {
                  height: { magnitude: 1000000, unit: "EMU" },
                  width: { magnitude: 8000000, unit: "EMU" },
                },
                transform: {
                  scaleX: 1,
                  scaleY: 1,
                  translateX: 500000,
                  translateY: 500000,
                  unit: "EMU",
                },
              },
            },
          },
          {
            insertText: {
              objectId: titleId,
              text: data.title || id.replace("_", " ").toUpperCase(),
            },
          },
          {
            createShape: {
              objectId: bodyId,
              shapeType: "TEXT_BOX",
              elementProperties: {
                pageObjectId: slideId,
                size: {
                  height: { magnitude: 4000000, unit: "EMU" },
                  width: { magnitude: 8000000, unit: "EMU" },
                },
                transform: {
                  scaleX: 1,
                  scaleY: 1,
                  translateX: 500000,
                  translateY: 1800000,
                  unit: "EMU",
                },
              },
            },
          },
          {
            insertText: {
              objectId: bodyId,
              text: `VISUAL:\n${data.visual || "(empty)"}\n\nNARRATION:\n${data.narration || "(empty)"}`,
            },
          }
        );
      });

      // 3. Apply updates
      await slides.presentations.batchUpdate({
        presentationId,
        requestBody: { requests },
      });

      res.json({
        success: true,
        presentationId,
        url: `https://docs.google.com/presentation/d/${presentationId}/edit`,
      });
    } catch (error: any) {
      console.error("Google Slides Export Error:", error);
      res.status(500).json({ error: error.message || "Failed to export to Google Slides" });
    }
  });

  // API Route for Text-to-Speech
  app.post("/api/tts", async (req, res) => {
    const { text } = req.body;
    // Fallback to GEMINI_API_KEY if specific TTS key is missing
    const apiKey = process.env.TEXT_TO_SPEECH_API_KEY || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "Text-to-Speech API key is not configured. Please add TEXT_TO_SPEECH_API_KEY to your secrets." });
    }

    if (!text) {
      return res.status(400).json({ error: "Text is required" });
    }

    try {
      const response = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: { text },
          voice: { languageCode: 'en-US', ssmlGender: 'NEUTRAL' },
          audioConfig: { audioEncoding: 'MP3' },
        }),
      });

      const result = await response.json();
      if (result.audioContent) {
        res.json({ audioContent: result.audioContent });
      } else {
        const errorMsg = result.error?.message || "Failed to synthesize speech";
        if (errorMsg.includes("API key not valid")) {
          throw new Error("The provided Google Cloud API key is invalid or does not have the Text-to-Speech API enabled. Please check your secrets.");
        }
        throw new Error(errorMsg);
      }
    } catch (error: any) {
      console.error("TTS Error:", error);
      res.status(500).json({ error: error.message || "Failed to synthesize speech" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
