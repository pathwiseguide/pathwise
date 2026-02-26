// Script to update Essay Writing module with new pages
const fs = require('fs');
const path = require('path');

const coursePath = path.join(__dirname, 'data', 'course.json');
const course = JSON.parse(fs.readFileSync(coursePath, 'utf8'));

const essayModule = course.modules.find(m => m.id === 'module-4');
if (!essayModule) throw new Error('Essay module not found');

essayModule.pages = [
  {
    id: 'essay-p1',
    title: 'Understanding the Common App Essay',
    content: `What Is This Essay Really For?
The Common App personal statement is your 650-word opportunity to speak directly to admissions officers. It travels with your application to nearly every college on your list, serving as the bridge between your statistics and your humanity.

Purpose: To reveal character, values, and perspective that cannot be captured in grades, test scores, or activity lists.

Format: 250-650 words, submitted through the Common Application platform.

Audience: Admissions officers who read thousands of essays each season. They are looking for authenticity, self-awareness, and evidence of how you think.

Why It Matters So Much
Selective colleges receive applications from more qualified candidates than they can admit. When faced with dozens of applicants who all have perfect GPAs and top test scores, the essay becomes the differentiator. It answers the question: Who is this person, really?

The essay humanizes your application. It transforms you from a collection of data points into a real individual with curiosity, resilience, humor, or wisdom.`,
    activity: null
  },
  {
    id: 'essay-p2',
    title: 'The Seven Prompts Explained',
    content: `Prompt 1: Background, Identity, Interest, or Talent
The Question: Some students have a background, identity, interest, or talent that is so meaningful they believe their application would be incomplete without it. If this sounds like you, then please share your story.
What Works: Specific cultural traditions, unusual hobbies, family circumstances that shaped your worldview, or talents that reveal deeper character traits.
Strategy: Focus on one specific aspect rather than trying to cover your entire identity. Show how this element influences your daily life and perspective.

Prompt 2: Challenge, Setback, or Failure
The Question: The lessons we take from obstacles we encounter can be fundamental to later success. Recount a time when you faced a challenge, setback, or failure. How did it affect you, and what did you learn from the experience?
What Works: Genuine struggles that led to meaningful growth. The emphasis should be on the learning and resilience, not the trauma itself.
Strategy: Spend minimal time describing the problem. Focus most of your words on your response, the process of overcoming, and how you changed as a result.

Prompt 3: Questioning Beliefs or Ideas
The Question: Reflect on a time when you questioned or challenged a belief or idea. What prompted your thinking? What was the outcome?
What Works: Moments when you changed your mind about something important, stood up for an unpopular opinion, or navigated conflicting values.
Strategy: This is the most challenging prompt. Avoid sounding preachy or political. Keep the focus on your personal journey of questioning, not on convincing the reader of a position.

Prompt 4: Gratitude
The Question: Reflect on something that someone has done for you that has made you happy or thankful in a surprising way. How has this gratitude affected or motivated you?
What Works: Small, unexpected acts of kindness that changed your trajectory or perspective. The focus should ultimately be on how this gratitude transformed you.
Strategy: Do not write a tribute to the other person. Use their action as a starting point to explore your own growth, values, or newfound motivation.

Prompt 5: Personal Growth
The Question: Discuss an accomplishment, event, or realization that sparked a period of personal growth and a new understanding of yourself or others.
What Works: Moments of genuine transformation, not just achievements. The realization matters more than the accomplishment itself.
Strategy: Choose an experience that fundamentally shifted how you see yourself or the world. Show the before and after with specific details.

Prompt 6: Intellectual Passion
The Question: Describe a topic, idea, or concept you find so engaging that it makes you lose all track of time. Why does it captivate you? What or who do you turn to when you want to learn more?
The Update: This prompt now explicitly asks what or who you turn to when learning more, emphasizing collaboration and resourcefulness.
What Works: Unexpected interests that reveal curiosity and depth. Avoid writing about your intended major—you will cover that elsewhere.
Strategy: Show your mind in action. Describe the rabbit holes you go down, the questions that keep you up at night, and how you pursue knowledge independently.

Prompt 7: Topic of Your Choice
The Question: Share an essay on any topic of your choice. It can be one you've already written, one that responds to a different prompt, or one of your own design.
What Works: Literally anything that reveals something essential about you. This is the most popular prompt for good reason.
Strategy: Use this if your best idea does not fit neatly into the other categories. Ensure your chosen topic still answers the underlying question: What do I want colleges to know about me?`,
    activity: null
  },
  {
    id: 'essay-p3',
    title: 'Choosing Your Topic',
    content: `The Brainstorming Process
Give yourself two to four weeks for genuine exploration. Rushing this phase leads to generic essays.

Activity One: The Uniqueness Exercise
List ten experiences, objects, or moments that feel specific to your life. Include small things: the way you organize your bookshelf, your Saturday morning routine, a conversation that stuck with you. Look for patterns in what you value.

Activity Two: The Passion Audit
Identify three topics you could talk about for thirty minutes without preparation. These often reveal genuine enthusiasm that translates to engaging writing.

Activity Three: The Vulnerability Check
Ask yourself what you are slightly uncomfortable sharing. Not trauma for shock value, but the authentic, imperfect truth about who you are. The best essays often come from this territory.

Red Flags to Avoid
The Resume Recitation: Do not list achievements or rehash your activities section. The essay must reveal something new.
The Tribute Essay: Writing primarily about your grandmother, coach, or mentor. If they appear, ensure the essay remains fundamentally about your growth.
The Trauma Dump: Sharing painful experiences without connecting them to present growth or insight. Admissions officers are not therapists.
The Generic Epiphany: Realizations about privilege, the value of hard work, or the importance of family that could be written by anyone.

Testing Your Topic
Before committing, verify your idea passes these tests:
The Specificity Test: Can you describe this using concrete details, dialogue, and scenes? Or are you relying on abstract statements?
The So What Test: What does this reveal about you that is not obvious from the rest of your application?
The Authenticity Test: Does this topic genuinely excite you? Can you imagine enjoying writing about it?`,
    activity: null
  },
  {
    id: 'essay-p4',
    title: 'Structuring Your Essay',
    content: `The Narrative Arc
Even short personal statements benefit from story structure. Consider this framework:

The Hook: Open with a specific moment, image, or question that immediately establishes voice and draws the reader in. Avoid dictionary definitions or grand philosophical statements.

The Context: Provide just enough background to orient the reader. Do not front-load with exposition.

The Rising Action: Build tension through specific scenes, challenges, or discoveries. Show your mind at work.

The Climax: The turning point or moment of realization. This should feel earned, not sudden.

The Resolution: Connect back to who you are now and who you hope to become. End with forward momentum.

Alternative Structures
The Thematic Approach: Organize around a central metaphor or motif that recurs throughout your life. One student used her shoe collection to explore identity and growth.

The Braided Narrative: Weave together two timelines or ideas that illuminate each other. Past and present, or two different passions that intersect.

The Circular Structure: Begin and end with the same image or idea, but show how your understanding of it has deepened.

Pacing and Proportion
The 70-30 Rule: Spend approximately 70 percent of your essay on reflection, analysis, and insight. Reserve only 30 percent for scene-setting and description.

The Zoom Lens: Alternate between wide shots (context, summary) and close-ups (specific moments with sensory detail). This creates rhythm and keeps the reader engaged.`,
    activity: null
  },
  {
    id: 'essay-p5',
    title: 'Writing with Voice and Style',
    content: `Finding Your Authentic Tone
Admissions officers can detect when you are performing. Your essay should sound like the most polished version of how you actually speak and think.

Avoid the Thesaurus Trap: Do not use words you would not naturally use. "My father would adjourn with me to Dee's Sports Bar" sounds ridiculous. "My dad's like, let's go to Dee's" sounds too casual. Find the middle ground: "My dad and I headed to Dee's Sports Bar."

Read Aloud: If a sentence feels awkward to speak, it will feel awkward to read. Trust your ear.

Embrace Imperfection: You do not need to present yourself as fully formed. Showing uncertainty, questioning, or ongoing growth often resonates more than polished certainty.

Showing Versus Telling
Weak: I am passionate about environmental conservation.
Strong: I spent three Saturdays sorting through my neighbor's recycling, rescuing perfectly good items from the trash, and researching local composting programs until my parents agreed to let me start a bin in our backyard.

The Principle: Anchor every abstract quality in concrete action, specific scene, or vivid detail.

Sentence Variety and Rhythm
Mix short, punchy sentences with longer, flowing ones. This creates musicality and keeps the reader engaged.

Example: "I failed. The chemistry exam sat on my desk, a red 62 staring up at me. But that number became my starting line, not my finish."`,
    activity: null
  },
  {
    id: 'essay-p6',
    title: 'The Revision Process',
    content: `The Timeline
Week One: Brainstorming and topic selection. Generate multiple possibilities before committing.
Week Two: First draft. Write without self-censorship. Get the story down.
Week Three: Structural revision. Ensure the arc is clear, the insight is earned, and every paragraph serves a purpose.
Week Four: Line editing. Polish sentences, verify word count, and refine voice.

The Feedback Strategy
First Reader: Someone who knows you well—a parent, close friend, or mentor. They should verify that the essay sounds like you and captures something true.
Second Reader: Someone who does not know you well—a teacher, counselor, or peer from a different circle. They should confirm that the essay stands alone and makes sense to strangers.
What to Ask: Do you understand what I am trying to convey? Where do you get bored? What feels most alive?

Common Revision Targets
The Slow Open: If your first paragraph does not grab attention, cut it. Start in the middle of the action.
The Unnecessary Summary: Cut any sentence that merely explains what the reader already knows from the scene you just showed.
The Missing Why: Every descriptive passage needs to connect to insight. Ask of each paragraph: what does this reveal about me?
The Abrupt Ending: Ensure your conclusion resonates beyond the specific story. Connect to broader values or future direction.`,
    activity: null
  },
  {
    id: 'essay-p7',
    title: 'Final Polish and Submission',
    content: `The Technical Checklist
Word Count: Stay within 250-650 words. Most successful essays fall between 500-650 words.
Formatting: The Common App text box removes formatting. Do not rely on italics, bold, or special fonts. Use paragraph breaks for structure.
Proofreading: Read backwards to catch spelling errors. Read aloud to catch awkward phrasing. Have someone else proofread for errors your eyes have grown blind to.

The Authenticity Final Check
Before submitting, ask yourself:
Does this essay sound like me at my best?
Would I feel comfortable discussing this topic in a college interview?
Does this add something essential to my application that appears nowhere else?

If you can answer yes to all three, you are ready.`,
    activity: null
  },
  {
    id: 'essay-p8',
    title: 'Inspiration and Examples',
    content: `What Strong Essays Do
They Start Small: One student wrote about collecting pebbles from every place she visited, using this habit to explore memory, impermanence, and her relationship with her grandmother.

They Surprise: Another wrote about his fascination with traffic patterns, revealing analytical thinking and unexpected curiosity.

They Risk: A student wrote about failing to start a business, showing humility, resilience, and genuine self-awareness rather than manufactured triumph.

Remember the Fundamentals
The best Common App essays are not about the most impressive experiences. They are about the most authentic insights. A story about working at a fast-food restaurant can be more compelling than a story about interning at a prestigious company if it reveals genuine growth and self-knowledge.

Your life contains multitudes. Trust that the small, specific, true things matter. Find the story only you can tell, tell it with precision and heart, and let the rest follow.`,
    activity: null
  },
  {
    id: 'essay-p9',
    title: 'Generate Your Common App Ideas',
    content: `This page is for generating ideas to write your Common App essay. Use the text box on the right to brainstorm topics, jot down moments that shaped you, or draft rough ideas. Your notes are saved as you type.`,
    activity: null,
    fullWidth: true,
    rightTextArea: true
  }
];

fs.writeFileSync(coursePath, JSON.stringify(course, null, 2));
console.log('Essay Writing module updated with 9 pages.');
