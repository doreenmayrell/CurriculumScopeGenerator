// Seed data for the Scope Result demo — mirrors the engine's analysis output shape.
// In production these come from the AI scoping run; here they are fixtures.

export const GRANULARITY = "GRANULARITY RULES — Grade 8 Math (TEKS) · v3.0\n\nLesson size\n- One lesson teaches ONE substandard (one row of the data model) — a single skill mastered in a 30–45 min session.\n- If a standard spans multiple representations (graph / table / two points / verbal), split into one lesson per representation.\n- Never combine computing a parameter (slope OR intercept) with constructing the full equation.\n\nDepth\n- Each lesson maps to exactly one Substandard Description and one measurable IXL-style objective.\n- Prerequisite review is its own lesson when the gap reaches into a prior grade band.\n\nDo NOT combine\n- Finding slope + finding y-intercept (separate lessons).\n- Procedural construction of y = mx + b + interpreting its parameters in context.\n\nAssessment boundary (per data model)\n- State explicitly what is and is not assessed.\n- Coordinate values range −10 to 10 on graphs; up to ±100 in written contexts.\n- Slopes/intercepts may be integers or simple fractions; no function notation in Grade 8 stems.";

export const SCOPE_STANDARDS = [
    {
      standard: "CCSS.MATH.CONTENT.8.F.B.4 — Construct a function to model a linear relationship between two quantities. Determine the rate of change and initial value of the function from a description of a relationship or from two (x, y) values, including reading these from a table or from a graph. Interpret the rate of change and initial value of a linear function in terms of the situation it models, and in terms of its graph or a table of values.",
      baseCode: "CCSS.MATH.CONTENT.8.F.B.4",
      breakdownFields: [
        { label: "Concepts", items: ["Linear function", "Rate of change (slope)", "Initial value (y-intercept)"] },
        { label: "Skills", items: ["Compute slope", "Identify the y-intercept", "Construct y = mx + b", "Interpret parameters"] },
        { label: "Sub-skills", items: ["Slope from a graph", "Slope from two points / table", "Intercept from a graph", "Model from a verbal description"] },
        { label: "Prerequisite knowledge", items: ["Ordered pairs", "Slope formula", "Integer & fraction operations"] },
      ],
      cognitive: "DOK 2–3 — construct a linear model across four representations (graph, table, two points, description) and interpret what each parameter means.",
      mastery: "Student builds y = mx + b from any representation and explains the rate of change and initial value in the situation's units.",
      fully: [
        { name: "Finding Slope from a Graph", explanation: "Covers reading rate of change directly from a coordinate grid — integer and simple-fraction slopes within the −10 to 10 boundary." },
        { name: "Finding Slope from Two Points", explanation: "Fully covers applying the slope formula to two ordered pairs or a table; satisfies the 'rate of change from two (x, y) values' chunk." },
        { name: "Finding Y-Intercept on a Graph", explanation: "Covers determining the initial value as the point where the line crosses the y-axis, labeled and unlabeled." },
        { name: "Writing an Equation for a Line from Two Points", explanation: "Covers constructing the full y = mx + b model — the 'construct a function' core of the standard." },
      ],
      partial: [
        { name: "Real World Problems Involving Writing Equations for Lines", covered: "Builds the equation of a line from a context or table of values.", missing: "Does not ask students to interpret what the slope and y-intercept mean in the situation's units — the standard's interpretive demand.", action: "Revise to add an interpretation prompt, OR add the new interpretation lesson below." },
      ],
      newLessons: [
        {
          code: "8.F.B.4a", name: "Rate of Change & Initial Value from a Verbal Description",
          reasonType: "stateSet",
          reason: "The uploaded new standard system requires students to extract rate of change and initial value from written contexts with heavier emphasis than the aligned CCSS language.",
          objective: "I can find the rate of change and initial value of a linear function from a written description of a situation.",
          purpose: "The library derives slope and intercept from graphs, points, and tables — but never from a verbal description, which the standard explicitly requires.",
          prereqs: "Finding Slope from Two Points — slope formula; Finding Y-Intercept on a Graph — initial value.",
          assessed: "Extracting rate of change and initial value from a written linear scenario (values up to ±100). Not assessed: non-linear situations, function notation. Begins after slope and intercept are fluent from graphs; ends before full equation interpretation.",
          before: ["Finding Slope from Two Points", "Finding Y-Intercept on a Graph"], after: ["Interpreting Slope and Intercept in Context"],
          difficulties: [
            { level: "Easy", format: "A one-sentence scenario states a starting amount and a constant rate. The student identifies each value.", example: "A pool starts with 20 gallons and fills at 5 gallons per minute. What is the rate of change and what is the initial value?", rigor: "Direct extraction — both values stated explicitly in the text." },
            { level: "Medium", format: "The scenario gives a starting amount and rate in mixed order or with a negative rate; the student assigns each to m and b.", example: "A phone battery is at 90% and drops 8% each hour. Determine the rate of change and the initial value for this situation.", rigor: "Requires correctly signing the rate and distinguishing it from the initial value." },
            { level: "Hard", format: "The description gives two moments in time rather than an explicit rate; the student must compute the rate first.", example: "After 2 hours a tank holds 46 L; after 5 hours it holds 31 L. Find the rate of change and the initial value of the linear model.", rigor: "Two-step: compute rate from two implied points, then back-solve the initial value." },
          ],
        },
        {
          code: "8.F.B.4b", name: "Interpreting Slope and Intercept in Context",
          reasonType: "library",
          reason: "This expectation is already part of CCSS, but the current lesson library only partially covers it because students build equations without explaining parameter meaning in context.",
          objective: "I can explain what the rate of change and initial value of a linear function mean in the real situation it models.",
          purpose: "Closes the interpretation gap left by the partially-covered real-world lesson — students construct equations but do not yet articulate parameter meaning.",
          prereqs: "Writing an Equation for a Line from Two Points; Rate of Change & Initial Value from a Verbal Description.",
          assessed: "Interpreting m and b in a labeled context, including units. Not assessed: constructing the equation itself (covered earlier), extrapolation beyond the data. Begins once equations are built fluently; ends before systems of equations.",
          before: ["Real World Problems Involving Writing Equations for Lines"], after: ["Classify Functions as Linear or Non-Linear"],
          difficulties: [
            { level: "Easy", format: "An equation and its context are given; the student states what the slope means in words.", example: "A taxi fare is y = 2x + 3, where x is miles. What does the 2 represent in this situation?", rigor: "Single-parameter interpretation with the equation provided." },
            { level: "Medium", format: "The student interprets BOTH the slope and the intercept and attaches correct units.", example: "A gym membership costs y = 25x + 40 dollars, where x is months. Explain what both the 25 and the 40 mean, including units.", rigor: "Interprets two parameters and supplies units for each." },
            { level: "Hard", format: "Two linear models are compared; the student reasons about which has the greater rate or initial value and what that means.", example: "Plan A: y = 15x + 50. Plan B: y = 20x + 20. Explain which plan starts cheaper and which becomes more expensive over time, using the slopes and intercepts.", rigor: "Comparative interpretation across two models in context." },
          ],
        },
      ],
    },
    {
      standard: "CCSS.MATH.CONTENT.8.EE.B.5 — Graph proportional relationships, interpreting the unit rate as the slope of the graph. Compare two different proportional relationships represented in different ways.",
      baseCode: "CCSS.MATH.CONTENT.8.EE.B.5",
      breakdownFields: [
        { label: "Concepts", items: ["Proportional relationship", "Unit rate as slope", "Constant of proportionality"] },
        { label: "Skills", items: ["Graph y = kx", "Read unit rate from a graph", "Compare across representations"] },
        { label: "Sub-skills", items: ["Identify k from a table", "Connect unit rate to slope", "Compare a graph vs. an equation"] },
        { label: "Prerequisite knowledge", items: ["Ratios & unit rate", "Plotting ordered pairs", "Slope from a graph"] },
      ],
      cognitive: "DOK 2–3 — graph proportional relationships and compare two represented in different forms.",
      mastery: "Student graphs y = kx, names the unit rate as the slope, and compares two relationships given as a graph, table, or equation.",
      fully: [
        { name: "Identifying Proportional Relationships", explanation: "Covers deciding whether a relationship is proportional from a table, graph, or equation — the entry skill for the standard." },
        { name: "Represent Proportional Relationships", explanation: "Covers writing and graphing y = kx, satisfying the 'graph proportional relationships' chunk." },
      ],
      partial: [
        { name: "Finding Slope from a Graph", covered: "Reading slope from a line on a coordinate grid.", missing: "Does not connect that slope to the unit rate / constant of proportionality of the relationship.", action: "Revise to name slope as the unit rate in proportional contexts, OR add the new lesson below." },
      ],
      newLessons: [
        {
          code: "8.EE.B.5a", name: "Comparing Two Proportional Relationships Across Representations",
          reasonType: "library",
          reason: "This is a CCSS expectation, but the current library covers single proportional relationships more strongly than cross-representation comparison.",
          objective: "I can compare two proportional relationships when one is a graph and the other is a table or equation.",
          purpose: "The library represents and identifies single proportional relationships but never asks students to compare two given in different forms — the second half of the standard.",
          prereqs: "Represent Proportional Relationships — y = kx; Finding Slope from a Graph — read the rate.",
          assessed: "Comparing the unit rate / slope of two proportional relationships in different representations (whole-number and simple-fraction rates). Not assessed: non-proportional relationships, negative rates. Begins after single relationships are fluent; ends before full linear functions.",
          before: ["Represent Proportional Relationships"], after: ["Interpreting Slope and Intercept in Context"],
          difficulties: [
            { level: "Easy", format: "Two graphs of proportional lines are shown; the student picks the one with the greater unit rate.", example: "Two lines through the origin are graphed. Which represents the faster rate, and how do you know from the graph?", rigor: "Visual comparison of two like representations." },
            { level: "Medium", format: "One relationship is a graph, the other a table; the student compares unit rates.", example: "Runner A's distance is graphed; Runner B's is given in a table. Who runs faster? Justify using the unit rate of each.", rigor: "Compares the unit rate across two different representations." },
            { level: "Hard", format: "One relationship is an equation, the other a verbal/graph form; the student compares and explains.", example: "Store A charges y = 4x dollars for x pounds. Store B's price is shown on a graph passing through (3, 15). Which is the better deal, and why?", rigor: "Translates an equation and a graph to a common unit rate, then reasons." },
          ],
        },
      ],
    },
  ];

export const KINDERGARTEN_SCOPE_STANDARDS = [
    {
      standard: "TEKS Math K.2 - Number and operations. The student applies mathematical process standards to understand how to represent and compare whole numbers, the relative position and magnitude of whole numbers, and relationships within the numeration system.",
      baseCode: "TEKS.MATH.K.2",
      breakdownFields: [
        { label: "Concepts", items: ["Rote counting sequence", "Forward and backward counting", "One more / one less", "Numbers to 20"] },
        { label: "Skills", items: ["Count forward to 20", "Count backward from 20", "Generate one more", "Generate one less"] },
        { label: "TEKS expectations", items: ["K.2A", "K.2F"] },
        { label: "CCSS comparison", items: ["CCSS K.CC counts forward only", "Successor ('one larger') is recognized, not generated without models", "No explicit backward-counting or one-less expectation"] },
      ],
      cognitive: "DOK 1-2 - produce the counting sequence in both directions and generate adjacent numbers up to 20 without relying on objects.",
      mastery: "Student counts forward and backward to at least 20 and generates the number one more or one less than a given number up to 20, with and without objects.",
      fully: [],
      partial: [],
      newLessons: [
        {
          code: "K.2.A", name: "Counting Backward: Numbers up to 20",
          reasonType: "stateSet",
          reason: "TEKS K.2A requires students to count forward AND backward to at least 20, with and without objects. Kindergarten CCSS counting (K.CC.A) emphasizes counting forward from a given number and does not explicitly require counting backward.",
          objective: "I can count backward from a given number to at least 20.",
          purpose: "Gives CCSS-only students practice with the backward counting sequence that TEKS requires but the CCSS counting standards do not.",
          prereqs: "Counting Forward to 20 - the rote forward sequence; one-to-one correspondence with objects to 20.",
          assessed: "Counting backward from a given starting number within 20, with and without objects. Not assessed: skip counting, numbers beyond 20, or reading and writing numerals.",
          before: ["Counting Forward to 20"], after: ["One More, One Less to 20"],
          difficulties: [
            { level: "Easy", format: "A short backward sequence is shown with a number line or counters; the student names the next number down.", example: "Count backward: 5, 4, 3, ___. What number comes next?", rigor: "Single backward step from a small number, with a visible model." },
            { level: "Medium", format: "The student continues a backward count over a few numbers without objects.", example: "Start at 12 and count backward. What are the next two numbers?", rigor: "Sustains the backward sequence with no model." },
            { level: "Hard", format: "The student finds a missing number in a backward count to 20 that crosses a ten.", example: "Count backward: 20, 19, 18, ___, 16. Which number is missing?", rigor: "Backward sequence within 20 across a decade, no support." },
          ],
        },
        {
          code: "K.2.F", name: "One More, One Less to 20",
          reasonType: "stateSet",
          reason: "TEKS K.2F requires students to generate a number that is one more than or one less than another number up to at least 20. CCSS does not explicitly address this - it only states that each successive number name refers to a quantity one larger, and that idea is typically tested only with models, whereas TEKS expects students to generate one-more and one-less without models.",
          objective: "I can name the number that is one more than or one less than a given number up to 20.",
          purpose: "Builds the TEKS generative one-more / one-less skill (without relying on objects) that the CCSS 'one larger' successor idea does not fully cover.",
          prereqs: "Counting Forward to 20; Counting Backward: Numbers up to 20.",
          assessed: "Generating the number one more or one less than a given number up to 20, with and without objects. Not assessed: adding or subtracting other amounts, numbers beyond 20, or comparison vocabulary beyond one-more / one-less.",
          before: ["Counting Backward: Numbers up to 20"], after: ["Comparing Numbers to 20"],
          difficulties: [
            { level: "Easy", format: "The student finds one more than a small number with a model such as a ten-frame or counters.", example: "There are 6 counters. What number is one more than 6?", rigor: "One-more from a small number with a visible model." },
            { level: "Medium", format: "The student finds one more or one less than a number up to 20 without objects.", example: "What number is one less than 14?", rigor: "Generates an adjacent number with no model." },
            { level: "Hard", format: "The student finds one more and one less across a ten boundary.", example: "What is one less than 20? What is one more than 19?", rigor: "Generates adjacent numbers at a decade boundary with no model." },
          ],
        },
      ],
    },
    {
      standard: "TEKS Math K.9 - Personal financial literacy. The student applies mathematical process standards to manage one's financial resources effectively for lifetime financial security.",
      baseCode: "TEKS.MATH.K.9",
      breakdownFields: [
        { label: "Concepts", items: ["Income", "Gifts", "Jobs", "Wants and needs"] },
        { label: "Skills", items: ["Identify ways to earn income", "Sort income vs. gifts", "Name job skills", "Distinguish wants from needs"] },
        { label: "TEKS expectations", items: ["K.9A", "K.9B", "K.9C", "K.9D"] },
        { label: "CCSS comparison", items: ["No direct Kindergarten CCSS financial literacy strand", "Requires TEKS-aligned bridge lessons"] },
      ],
      cognitive: "DOK 1-2 - identify everyday financial concepts, sort examples, and explain simple choices using age-appropriate language.",
      mastery: "Student recognizes income, gifts, job skills, wants, and needs well enough to participate successfully in TEKS Kindergarten financial literacy tasks.",
      fully: [],
      partial: [],
      newLessons: [
        {
          code: "K.9A", name: "Ways People Earn Income",
          reasonType: "stateSet",
          reason: "TEKS K.9A asks students to identify ways to earn income. Kindergarten CCSS math does not include a direct personal financial literacy expectation for earning income.",
          objective: "I can name ways people earn income.",
          purpose: "Gives CCSS-only students exposure and practice with the TEKS idea that people can earn money by doing work.",
          prereqs: "Basic vocabulary for jobs, work, money, and helping roles at home, school, and in the community.",
          assessed: "Identifying simple ways people earn income, such as doing a job or providing a service. Not assessed: wages, salaries, profit, or formal economics vocabulary.",
          before: ["Classroom Jobs and Community Helpers"], after: ["Income and Gifts"],
          difficulties: [
            { level: "Easy", format: "A picture shows one person doing a familiar paid job; the student identifies it as a way to earn income.", example: "A baker makes bread to sell. Is this a way to earn income?", rigor: "Recognizes an obvious work-for-money situation." },
            { level: "Medium", format: "The student chooses which of two activities could earn income.", example: "Which could be a way to earn income: walking a dog for a neighbor or opening a birthday present?", rigor: "Distinguishes earning from receiving." },
            { level: "Hard", format: "The student explains why an activity could earn income.", example: "A person washes cars for others. How could that help the person earn income?", rigor: "Connects work or service to receiving money." },
          ],
        },
        {
          code: "K.9B", name: "Income and Gifts",
          reasonType: "stateSet",
          reason: "TEKS K.9B asks students to differentiate between money received as income and money received as gifts. Kindergarten CCSS math has no matching financial literacy expectation.",
          objective: "I can tell whether money was earned as income or received as a gift.",
          purpose: "Builds the TEKS distinction between earned money and gift money for students whose prior instruction only followed CCSS.",
          prereqs: "Ways People Earn Income; everyday examples of birthdays, holidays, chores, and jobs.",
          assessed: "Sorting simple scenarios as income or gift. Not assessed: allowance policies, taxes, banking, or formal definitions of compensation.",
          before: ["Ways People Earn Income"], after: ["Wants, Needs, and Income"],
          difficulties: [
            { level: "Easy", format: "One scenario clearly describes a gift.", example: "Grandma gives Mia $1 for her birthday. Is the money income or a gift?", rigor: "Recognizes direct gift language." },
            { level: "Medium", format: "The student sorts two scenarios, one earned and one gifted.", example: "Sam gets money for feeding a neighbor's cat. Ava gets money in a card. Which is income? Which is a gift?", rigor: "Compares two sources of money." },
            { level: "Hard", format: "The student explains the reason for the classification.", example: "Luis got money after helping at a lemonade stand. Why is that income instead of a gift?", rigor: "Uses reasoning about work and earning." },
          ],
        },
        {
          code: "K.9C", name: "Simple Skills People Use for Jobs",
          reasonType: "stateSet",
          reason: "TEKS K.9C asks students to list simple skills required for jobs. Kindergarten CCSS math does not address job skills as a math or financial literacy expectation.",
          objective: "I can name simple skills people use to do jobs.",
          purpose: "Connects earning income to the skills people use in jobs, which is required by the TEKS financial literacy strand.",
          prereqs: "Ways People Earn Income; familiar community helper and classroom job vocabulary.",
          assessed: "Naming simple job skills such as counting, listening, helping, building, drawing, cooking, or cleaning. Not assessed: career pathways or job training.",
          before: ["Ways People Earn Income"], after: ["Wants, Needs, and Income"],
          difficulties: [
            { level: "Easy", format: "A picture shows a familiar job; the student names one skill used.", example: "A cook makes soup. Name one skill a cook uses.", rigor: "Names an obvious skill from a familiar role." },
            { level: "Medium", format: "The student matches skills to two jobs.", example: "Who needs to count carefully: a cashier, a singer, or both? Explain.", rigor: "Connects a skill to a job context." },
            { level: "Hard", format: "The student lists more than one skill for a job and explains why each helps.", example: "A teacher reads books and helps students. Name two skills a teacher uses.", rigor: "Gives multiple relevant skills with reasoning." },
          ],
        },
        {
          code: "K.9D", name: "Wants, Needs, and Income",
          reasonType: "stateSet",
          reason: "TEKS K.9D asks students to distinguish wants and needs and identify income as a source to meet wants and needs. Kindergarten CCSS math does not include this financial decision-making expectation.",
          objective: "I can tell the difference between wants and needs and explain that income can help pay for them.",
          purpose: "Gives CCSS-only students the TEKS financial literacy foundation for discussing choices about money, wants, and needs.",
          prereqs: "Income and Gifts; Simple Skills People Use for Jobs.",
          assessed: "Classifying familiar items as wants or needs and identifying income as a source of money to meet them. Not assessed: budgeting, saving plans, debt, or price comparison.",
          before: ["Income and Gifts", "Simple Skills People Use for Jobs"], after: ["Personal Financial Literacy Review"],
          difficulties: [
            { level: "Easy", format: "The student classifies one familiar item as a want or need.", example: "Is food a want or a need?", rigor: "Identifies an obvious need." },
            { level: "Medium", format: "The student sorts several examples and names income as money used to meet needs or wants.", example: "Sort these: shoes, toy, water. Which are needs? Which is a want? What can income help buy?", rigor: "Combines classification with income as a money source." },
            { level: "Hard", format: "The student explains a choice between a want and a need.", example: "A family has income to buy lunch or a new toy. Which is the need? Explain.", rigor: "Applies wants/needs reasoning to a simple decision." },
          ],
        },
      ],
    },
    {
      standard: "TEKS Math K.4 - Number and operations. The student identifies U.S. coins by name, including pennies, nickels, dimes, and quarters.",
      baseCode: "TEKS.MATH.K.4",
      breakdownFields: [
        { label: "Concepts", items: ["Coins", "Money names", "Monetary transactions"] },
        { label: "Skills", items: ["Identify penny", "Identify nickel", "Identify dime", "Identify quarter"] },
        { label: "TEKS expectations", items: ["K.4"] },
        { label: "CCSS comparison", items: ["No direct Kindergarten CCSS coin-identification standard"] },
      ],
      cognitive: "DOK 1 - recognize and name common U.S. coins using visible attributes.",
      mastery: "Student identifies pennies, nickels, dimes, and quarters by name in preparation for TEKS money and transaction work.",
      fully: [],
      partial: [],
      newLessons: [
        {
          code: "K.4", name: "Identifying U.S. Coins by Name",
          reasonType: "stateSet",
          reason: "TEKS K.4 requires students to identify U.S. coins by name, including pennies, nickels, dimes, and quarters. Kindergarten CCSS math does not include a direct coin-identification expectation.",
          objective: "I can name pennies, nickels, dimes, and quarters.",
          purpose: "Provides CCSS-only students with the coin-recognition exposure and practice needed for TEKS Kindergarten money expectations.",
          prereqs: "Visual discrimination; sorting objects by attributes such as size, color, and markings.",
          assessed: "Identifying pennies, nickels, dimes, and quarters by name. Not assessed: coin values, counting money, or making change.",
          before: ["Sorting Objects by Attributes"], after: ["Personal Financial Literacy Review"],
          difficulties: [
            { level: "Easy", format: "The student names one isolated coin.", example: "Point to the penny. What is this coin called?", rigor: "Direct recognition with no distractors." },
            { level: "Medium", format: "The student names coins from a mixed set.", example: "Name each coin: penny, nickel, dime, quarter.", rigor: "Distinguishes among four common coins." },
            { level: "Hard", format: "The student uses attributes to justify a coin name.", example: "How do you know this coin is a quarter and not a nickel?", rigor: "Uses observable attributes to support identification." },
          ],
        },
      ],
    },
  ];

export function gradeKey(grade = "") {
  const value = String(grade).trim().toLowerCase();
  if (["k", "kg", "kinder", "kindergarten", "0"].includes(value)) return "K";
  return value.replace(/^grade\s+/i, "");
}

export function gradeLabel(grade = "") {
  const key = gradeKey(grade);
  if (key === "K") return "Kindergarten";
  if (!key) return "this workspace grade";
  if (/^\d+$/.test(key)) return `Grade ${key}`;
  return key.replace(/\b\w/g, (c) => c.toUpperCase());
}

// Ordinal grade form for export titles: "5th Grade", "8th Grade", "Kindergarten".
export function gradeTitle(grade = "") {
  const key = gradeKey(grade);
  if (key === "K") return "Kindergarten";
  if (!key) return "";
  if (/^\d+$/.test(key)) {
    const n = parseInt(key, 10);
    const v = n % 100;
    const suffix = v >= 11 && v <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th";
    return `${n}${suffix} Grade`;
  }
  return key.replace(/\b\w/g, (c) => c.toUpperCase());
}

function genericScopeStandardsForGrade(grade) {
  const key = gradeKey(grade) || "workspace";
  const label = gradeLabel(grade);
  const codePrefix = `WORKSPACE.${String(key).toUpperCase()}.GAP`;

  return [
    {
      standard: `${label} CCSS comparison — New standard system expectations that extend beyond the grade-level CCSS baseline.`,
      baseCode: `${codePrefix}.A.1`,
      breakdownFields: [
        { label: "Concepts", items: ["New standard system", `${label} CCSS baseline`, "Gap expectation"] },
        { label: "Skills", items: ["Identify non-CCSS expectations", "Design bridge practice", "Build mastery evidence"] },
        { label: "Sub-skills", items: ["Name the gap", "Sequence prerequisite practice", "Create aligned assessment boundary"] },
        { label: "Prerequisite knowledge", items: [`Prior ${label} CCSS skills`, "Vocabulary from the new standard system", "Concrete-to-representational practice"] },
      ],
      cognitive: "DOK 1–3 — identify where the new standard system asks students to do something beyond the grade-level CCSS baseline and convert that expectation into teachable lesson scope.",
      mastery: "Student receives exposure, guided practice, independent practice, and mastery checks for the new-standard-system expectation.",
      fully: [],
      partial: [],
      newLessons: [
        {
          code: `${key}.GAP.1`, name: `${label} Bridge Lesson for New Standard Gap`,
          reasonType: "stateSet",
          reason: `The uploaded new standard system includes an expectation that is not represented in the ${label} CCSS baseline. This proposed lesson ensures CCSS-only students can practice and master the additional expectation.`,
          objective: "I can use the needed skill from the new standard system and explain my thinking.",
          purpose: "Gives students who only followed CCSS the missing exposure, practice, and mastery path needed for the new standard system.",
          prereqs: `${label} CCSS prerequisite skills connected to the uploaded standard.`,
          assessed: "The specific new-standard-system expectation and its prerequisite reasoning. Not assessed: unrelated extensions outside the uploaded standard system.",
          before: [`${label} CCSS prerequisite lesson`], after: ["Uploaded-standard-set mastery check"],
          difficulties: [
            { level: "Easy", format: "A direct task introduces the new expectation with concrete support.", example: "Use objects, drawings, or a simple model to show the new standard expectation.", rigor: "Exposure and guided entry into the gap skill." },
            { level: "Medium", format: "The student applies the expectation in a familiar grade-level context.", example: "Solve a grade-level task that requires the new-standard-system skill and explain the strategy used.", rigor: "Independent practice with explanation." },
            { level: "Hard", format: "The student chooses an efficient representation and justifies the answer.", example: "Solve a new task, select a representation, and explain why it matches the uploaded standard expectation.", rigor: "Transfer and mastery evidence." },
          ],
        },
      ],
    },
    {
      standard: `${label} CCSS lesson-library coverage check — Grade-level CCSS expectations that may not yet be represented in the lesson library.`,
      baseCode: `${codePrefix}.B.1`,
      breakdownFields: [
        { label: "Concepts", items: [`${label} CCSS`, "Lesson library coverage", "Missing lesson scope"] },
        { label: "Skills", items: ["Audit CCSS expectations", "Find missing lessons", "Create coverage lesson"] },
        { label: "Sub-skills", items: ["Match standards to lessons", "Identify partial coverage", "Propose complete coverage"] },
        { label: "Prerequisite knowledge", items: ["Current lesson library", "Grade-level CCSS progression", "Lesson scope rules"] },
      ],
      cognitive: "DOK 2 — compare grade-level CCSS expectations to the current lesson library and identify missing coverage.",
      mastery: "The lesson library fully covers the grade-level CCSS expectation before new-standard-system extensions are layered on.",
      fully: [],
      partial: [],
      newLessons: [
        {
          code: `${key}.LIB.1`, name: `${label} CCSS Coverage Lesson`,
          reasonType: "library",
          reason: `This is a ${label} CCSS expectation, but the current lesson library does not yet contain a complete lesson for it.`,
          objective: "I can master the missing grade-level CCSS expectation.",
          purpose: "Closes the lesson-library coverage gap before comparing the uploaded new standard system to CCSS.",
          prereqs: `${label} prerequisite standards for this CCSS expectation.`,
          assessed: "The missing grade-level CCSS expectation. Not assessed: uploaded-standard extensions beyond CCSS.",
          before: [`${label} prerequisite lesson`], after: ["Uploaded-standard-set bridge lessons"],
          difficulties: [
            { level: "Easy", format: "A direct CCSS-aligned task with clear scaffolding.", example: "Complete a simple task that targets the missing CCSS expectation.", rigor: "Introduces the missing CCSS skill." },
            { level: "Medium", format: "A grade-level task requiring independent application.", example: "Apply the CCSS skill in a familiar problem and explain the answer.", rigor: "Independent CCSS practice." },
            { level: "Hard", format: "A transfer task requiring explanation or representation choice.", example: "Choose a strategy or representation and justify why it works for the CCSS task.", rigor: "Mastery-level CCSS evidence." },
          ],
        },
      ],
    },
  ];
}

export function getScopeStandardsForGrade(grade) {
  const key = gradeKey(grade);
  if (key === "K") return KINDERGARTEN_SCOPE_STANDARDS;
  if (!key || key === "8") return SCOPE_STANDARDS;
  return genericScopeStandardsForGrade(grade);
}

export const RUNS = [
    { id: "r1", title: "8.F.B.4 — Linear functions scope", date: "Jun 21, 2026 · 4:12 PM", status: "complete" },
    { id: "r2", title: "8.NS.A — Real number system", date: "Jun 18, 2026 · 11:03 AM", status: "complete" },
    { id: "r3", title: "8.G.A — Transformations scope", date: "Jun 14, 2026 · 9:47 AM", status: "failed" },
  ];
