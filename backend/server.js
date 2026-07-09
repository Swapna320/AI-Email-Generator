import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { OpenAI } from "openai";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Initialize OpenAI client lazily
let openai;

app.get("/", (req, res) => {
    res.send("Backend Running");
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  const hasServerKey = process.env.OPENAI_API_KEY && 
                       process.env.OPENAI_API_KEY !== 'sk-xxxxxxxxxxxxxxxxxxxxxxxx' && 
                       process.env.OPENAI_API_KEY.trim() !== '';
  res.json({ 
    status: 'ok', 
    message: 'Backend server is running smoothly',
    serverKeyConfigured: !!hasServerKey
  });
});

// Helper to generate dynamic, premium mock emails in Demo Mode
function generateMockEmail(recipient, sender, tone, context, keyPoints, emailType, length) {
  const rName = recipient || 'Recipient';
  const sName = sender || 'Sender';
  const eType = emailType || 'Email';
  const tTone = (tone || 'Professional').toLowerCase();
  
  let greeting = `Dear ${rName},`;
  let signoff = `Best regards,\n${sName}`;
  
  if (tTone === 'casual' || tTone === 'friendly') {
    greeting = `Hi ${rName},`;
    signoff = `Best,\n${sName}`;
  } else if (tTone === 'urgent') {
    greeting = `${rName},`;
    signoff = `Regards,\n${sName}`;
  }

  // Generate introductory sentence based on context and type
  let intro = `I am reaching out regarding ${context.toLowerCase().replace(/[.!?]+$/, '')}.`;
  if (eType.toLowerCase().includes('follow')) {
    intro = `I wanted to follow up on our previous discussion about ${context.toLowerCase().replace(/[.!?]+$/, '')}.`;
  } else if (eType.toLowerCase().includes('thank')) {
    intro = `Thank you for your time. I wanted to express my appreciation regarding ${context.toLowerCase().replace(/[.!?]+$/, '')}.`;
  } else if (eType.toLowerCase().includes('meeting')) {
    intro = `I would like to schedule a time for us to connect and discuss ${context.toLowerCase().replace(/[.!?]+$/, '')}.`;
  }

  // Key points section
  let pointsText = '';
  if (keyPoints && keyPoints.length > 0) {
    if (tTone === 'casual' || tTone === 'friendly') {
      pointsText = `Just a few quick points to share:\n` + keyPoints.map(p => `- ${p}`).join('\n');
    } else {
      pointsText = `Specifically, I want to address the following key points:\n` + keyPoints.map(p => `• ${p}`).join('\n');
    }
  } else {
    pointsText = `I look forward to discussing this further with you.`;
  }

  // Tone-specific body filler
  let filler = '';
  if (tTone === 'professional') {
    filler = `Please let me know your availability this week so we can align on the next steps.`;
  } else if (tTone === 'persuasive' || tTone === 'pitch') {
    filler = `I believe this is a great opportunity for us to collaborate and drive meaningful impact.`;
  } else if (tTone === 'urgent') {
    filler = `Since this is time-sensitive, please let me know your thoughts as soon as you have a moment.`;
  } else {
    filler = `Let me know if you have any questions!`;
  }

  // Length adjustments
  let finalBody = `${greeting}\n\n${intro}\n\n${pointsText}\n\n${filler}\n\n${signoff}`;
  if (length === 'Short') {
    finalBody = `${greeting}\n\n${intro} ${filler}\n\n${signoff}`;
  } else if (length === 'Long') {
    finalBody = `${greeting}\n\nI hope you are doing well.\n\n${intro}\n\n${pointsText}\n\nAdditionally, I want to emphasize that we are fully committed to making this successful and will support you in any way needed. ${filler}\n\nThank you for your time and consideration. I look forward to hearing from you.\n\n${signoff}`;
  }

  const subject = `Discussion regarding ${eType}`;
  return { subject, body: finalBody };
}

// Helper to call Gemini API with retries (exponential backoff) and model fallbacks
async function callGeminiWithRetryAndFallback(payload, apiKey, systemInstructionText = null) {
  const models = ['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-1.5-flash'];
  let lastError = null;

  for (const model of models) {
    let attempts = 0;
    const maxAttempts = 3;
    const baseDelay = 1000; // 1 second base delay

    while (attempts < maxAttempts) {
      try {
        console.log(`[Gemini] Attempting call with model: ${model} (attempt ${attempts + 1}/${maxAttempts})`);
        
        const reqBody = { ...payload };
        if (systemInstructionText) {
          reqBody.systemInstruction = {
            parts: [{ text: systemInstructionText }]
          };
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(reqBody)
        });

        const data = await response.json();
        
        if (!response.ok) {
          const errMsg = data.error?.message || `Gemini API returned status ${response.status}`;
          const status = response.status;
          
          // Check if error is due to rate limits or overloaded service
          const isRateLimitOrOverload = status === 429 || status === 503 || 
                                        errMsg.toLowerCase().includes('high demand') || 
                                        errMsg.toLowerCase().includes('rate limit') || 
                                        errMsg.toLowerCase().includes('exhausted') || 
                                        errMsg.toLowerCase().includes('temporary');
          
          if (isRateLimitOrOverload) {
            if (attempts < maxAttempts - 1) {
              attempts++;
              const delay = baseDelay * Math.pow(2, attempts); // exponential backoff: 2s, 4s
              console.warn(`[Gemini] Model ${model} rate limited/overloaded (${status}). Retrying in ${delay}ms... Error: ${errMsg}`);
              await new Promise(resolve => setTimeout(resolve, delay));
              continue;
            } else {
              console.warn(`[Gemini] Retries exhausted for model ${model}.`);
              throw new Error(errMsg);
            }
          }
          
          // Non-retriable HTTP error (e.g. 400 Bad Request, 403 Forbidden)
          throw new Error(errMsg);
        }

        if (!data.candidates || data.candidates.length === 0 || !data.candidates[0].content?.parts?.[0]?.text) {
          throw new Error('Invalid response structure from Gemini API');
        }

        console.log(`[Gemini] Successfully generated content using model: ${model}`);
        return data.candidates[0].content.parts[0].text;
      } catch (err) {
        console.error(`[Gemini] Error with model ${model} (attempt ${attempts + 1}):`, err.message);
        lastError = err;
        
        // If it's a network or transient error and we still have attempts left, retry
        const isNetworkOrTransient = err instanceof TypeError || 
                                     err.message.includes('fetch') || 
                                     err.message.includes('network') ||
                                     err.message.includes('timeout') ||
                                     err.message.includes('socket');
                                     
        if (isNetworkOrTransient && attempts < maxAttempts - 1) {
          attempts++;
          const delay = baseDelay * Math.pow(2, attempts);
          console.warn(`[Gemini] Network/transient error on model ${model}. Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        // Break out of the attempts loop to proceed to the next fallback model
        break;
      }
    }
  }

  throw lastError || new Error('Failed to generate content with Gemini API');
}

// Email generation endpoint
app.post('/api/generate-email', async (req, res) => {
  const { recipient, sender, tone, context, keyPoints, emailType, length, senderEmail, recipientEmail } = req.body;

  // Retrieve client API key from headers or request body, fallback to server key
  const clientApiKey = req.headers['x-api-key'] || req.body.apiKey;
  const apiKey = clientApiKey || process.env.OPENAI_API_KEY;

  // Fallback to Demo Mode if the API key is missing or is the default placeholder
  const isDemo = !apiKey || apiKey === 'sk-xxxxxxxxxxxxxxxxxxxxxxxx' || apiKey.trim() === '';

  if (isDemo) {
    const { subject, body } = generateMockEmail(recipient, sender, tone, context, keyPoints, emailType, length);

    return res.json({
      success: true,
      subject,
      body,
      rawContent: `Subject: ${subject}\n\n${body}`,
      isDemo: true
    });
  }

  if (!context) {
    return res.status(400).json({ error: 'Context/Prompt is required to generate an email.' });
  }

  const prompt = `
Generate an email with the following details:
- Sender: ${sender || 'User'} ${senderEmail ? `<${senderEmail}>` : ''}
- Recipient: ${recipient || 'Recipient'} ${recipientEmail ? `<${recipientEmail}>` : ''}
- Purpose/Context: ${context}
- Email Type/Format: ${emailType || 'Standard Email'}
- Tone: ${tone || 'Professional'}
- Length: ${length || 'Medium'}
- Key Points to Include: ${keyPoints && keyPoints.length > 0 ? keyPoints.join(', ') : 'None'}

Please output your response exactly in the following format:
Subject: [Subject here]

[Body here]
  `.trim();

  let emailText;
  const isGemini = apiKey.startsWith('AIza') || apiKey.startsWith('AQ.');

  try {
    if (isGemini) {
      const geminiPayload = {
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.7,
        }
      };
      const systemInstruction = 'You are an expert AI email copywriter. Your goal is to write high-converting, professional, and context-appropriate emails based on user requirements. Do not wrap your response in markdown code blocks or formatting code fences. Do not put markdown headers (like **Subject:** or ### Subject:) around the subject line.';
      
      emailText = await callGeminiWithRetryAndFallback(geminiPayload, apiKey, systemInstruction);
    } else {
      // Use OpenAI client
      let requestOpenai;
      if (clientApiKey) {
        requestOpenai = new OpenAI({
          apiKey: clientApiKey,
        });
      } else {
        if (!openai) {
          openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
          });
        }
        requestOpenai = openai;
      }

      const completion = await requestOpenai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert AI email copywriter. Your goal is to write high-converting, professional, and context-appropriate emails based on user requirements. Do not wrap your response in markdown code blocks or formatting code fences. Do not put markdown headers (like **Subject:** or ### Subject:) around the subject line.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
      });

      emailText = completion.choices[0].message.content;
    }
    
    // Robust parser to extract subject and body, stripping markdown markers and code blocks
    let cleanText = emailText.trim();
    // Remove markdown code fences if the model wrapped the response in one
    cleanText = cleanText.replace(/^```[a-zA-Z]*\n?/gi, '').replace(/\n?```$/g, '').trim();

    let subject = 'Generated Email';
    let body = cleanText;

    // Matches "Subject: ...", "**Subject:** ...", "### Subject: ...", etc.
    const subjectRegex = /^(?:#+\s*|\**)?Subject:\s*(.*?)(?:\**)?\n/i;
    const subjectMatch = cleanText.match(subjectRegex);
    if (subjectMatch) {
      subject = subjectMatch[1].trim();
      body = cleanText.replace(subjectRegex, '').trim();
    } else {
      // Fallback matching if there is no newline immediately after the subject
      const subjectFallbackRegex = /Subject:\s*(.*)/i;
      const fallbackMatch = cleanText.match(subjectFallbackRegex);
      if (fallbackMatch) {
        subject = fallbackMatch[1].trim();
        body = cleanText.replace(subjectFallbackRegex, '').trim();
      }
    }
    
    // Clean up any remaining leading/trailing spaces or newlines in the body
    body = body.trim();

    res.json({
      success: true,
      subject,
      body,
      rawContent: emailText
    });
  } catch (error) {
    console.error('Error generating email:', error);
    res.status(500).json({
      error: 'Failed to generate email',
      details: error.message
    });
  }
});

// Chatbot endpoint
app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Messages history is required' });
  }

  // Retrieve client API key from headers or request body, fallback to server key
  const clientApiKey = req.headers['x-api-key'] || req.body.apiKey;
  const apiKey = clientApiKey || process.env.OPENAI_API_KEY;

  // Fallback to Demo Mode if the API key is missing or is the default placeholder
  const isDemo = !apiKey || apiKey.startsWith('YOUR_') || apiKey.trim() === '';

  if (isDemo) {
    // Artificial delay to make it feel realistic
    await new Promise(resolve => setTimeout(resolve, 850));

    // Get the user's latest query
    const lastUserMessage = messages[messages.length - 1]?.content || '';
    
    // Generate context-aware demo responses
    let reply = "I'm running in Demo Mode. To unlock real AI copywriting suggestions, please configure your OpenAI or Gemini API key in Settings! ✉️";
    const lowerQuery = lastUserMessage.toLowerCase();

    if (lowerQuery.includes('hello') || lowerQuery.includes('hi') || lowerQuery.includes('hey')) {
      reply = "Hi there! I'm your copywriting assistant. In Demo Mode, I can answer simple questions. Once an API key is connected, I can fully help you optimize emails, brainstorm subject lines, or suggest tones. How can I help you today?";
    } else if (lowerQuery.includes('subject') || lowerQuery.includes('title')) {
      reply = "For catchy subject lines, try to keep them under 50 characters, use active verbs, and generate curiosity. (Pro-tip: Connect your API key to let me brainstorm 5 custom subject options for you!)";
    } else if (lowerQuery.includes('tone') || lowerQuery.includes('style')) {
      reply = "Changing tones changes the vocabulary. Professional tone uses formal greetings/closings, while Casual tone uses contractions and exclamation marks. How can I help you tweak your current draft?";
    } else if (lowerQuery.includes('thank') || lowerQuery.includes('thanks')) {
      reply = "You're very welcome! Let me know if you need help with anything else.";
    }

    return res.json({
      success: true,
      reply,
      isDemo: true
    });
  }

  try {
    const isGemini = apiKey.startsWith('AIza') || apiKey.startsWith('AQ.');

    if (isGemini) {
      // Map OpenAI message roles to Gemini content parts
      const geminiContents = messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));

      const geminiPayload = {
        contents: geminiContents
      };
      const systemInstruction = "You are a helpful copywriting chatbot assistant for an AI Email Generator app. Help the user improve, write, or format their emails.";

      const text = await callGeminiWithRetryAndFallback(geminiPayload, apiKey, systemInstruction);

      return res.json({
        success: true,
        reply: text.trim()
      });
    } else {
      // OpenAI Route
      const openai = new OpenAI({ apiKey });
      const systemMessage = {
        role: 'system',
        content: "You are a helpful copywriting chatbot assistant for an AI Email Generator app. Help the user improve, write, or format their emails."
      };
      
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [systemMessage, ...messages],
        temperature: 0.7,
      });

      const reply = completion.choices[0].message.content;

      return res.json({
        success: true,
        reply: reply.trim()
      });
    }
  } catch (error) {
    console.error('Error in chat endpoint:', error);
    res.status(500).json({
      error: 'Failed to generate chat response',
      details: error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
