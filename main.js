import $ from 'jquery';
import './style.less'; // Import Less file

// State to keep track of the currently displayed week's start date
let currentWeekStart = getMonday(new Date());

// --- Locale Detection ---
// Get browser locale, default to 'en-US'
const browserLocale = navigator.language || navigator.languages?.[0] || 'en-US';
// const targetLocale = 'fr'; // Uncomment this line to force French locale
const activeLocale = /* targetLocale || */ browserLocale; // Use forced locale if set, otherwise browser default

// --- IndexedDB Setup ---
const DB_NAME = 'WeeklyPlannerDB';
const DB_VERSION = 2; // Increment the database version to trigger upgradeneeded
const STORE_NAME = 'plannerData'; // Renamed store to be more general
let db;

// Open or create the database
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      db = event.target.result;
      // Create an object store for planner data, using date string as key
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
        console.log(`Object store '${STORE_NAME}' created.`); // Add log for confirmation
      } else {
        console.log(`Object store '${STORE_NAME}' already exists.`); // Add log for confirmation
      }
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      console.log("Database opened successfully."); // Add log for confirmation
      resolve(db);
    };

    request.onerror = (event) => {
      console.error("IndexedDB error:", event.target.errorCode);
      reject(event.target.errorCode);
    };
  });
}

// Save data for a specific date (word counts and text)
function saveData(dateString, data) {
  if (!db) {
    console.error("Database not open.");
    return;
  }
  const transaction = db.transaction([STORE_NAME], 'readwrite');
  const store = transaction.objectStore(STORE_NAME);
  store.put(data, dateString); // Use dateString as the key

  transaction.oncomplete = () => {
    // console.log(`Data saved for ${dateString}`);
  };

  transaction.onerror = (event) => {
    console.error("Save data error:", event.target.error);
  };
}

// Load data for a specific date
function loadData(dateString) {
  return new Promise((resolve, reject) => {
    if (!db) {
      console.error("Database not open.");
      resolve(null); // Resolve with null if DB not open
      return;
    }
    // Check if the store exists before creating a transaction
    if (!db.objectStoreNames.contains(STORE_NAME)) {
        console.error(`Object store '${STORE_NAME}' not found. Cannot load data.`);
        resolve(null); // Resolve with null if store doesn't exist
        return;
    }
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(dateString);

    request.onsuccess = (event) => {
      // Resolve with loaded data or default structure if not found
      resolve(event.target.result || { goal: 0, written: 0, text: '' });
    };

    request.onerror = (event) => {
      console.error("Load data error:", event.target.error);
      reject(event.target.error);
    };
  });
}


// --- Date Helper Functions ---

// Get the Monday of the week for a given date
function getMonday(d) {
  d = new Date(d);
  const day = d.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  return new Date(d.setDate(diff));
}

// Add days to a date
function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// Format date using a specific locale
function formatDate(date, locale, options) {
  // Default options if none provided
  const defaultOptions = { month: 'short', day: 'numeric' };
  return date.toLocaleDateString(locale, options || defaultOptions);
}

// Get the name of the day (e.g., "Mon", "Tue") using a specific locale
function getDayName(date, locale) {
    return date.toLocaleDateString(locale, { weekday: 'short' });
}

// Format date as YYYY-MM-DD for use as IndexedDB key
function formatDateKey(date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
}


// --- Core Logic ---

async function displayWeek(startDate, locale) {
  // Get the full month name of the first day of the week
  const monthName = startDate.toLocaleDateString(locale, { month: 'long' });
  // Capitalize the first letter of the month name
  const capitalizedMonthName = monthName.charAt(0).toUpperCase() + monthName.slice(1);

  // Get the year of the first day of the week
  const year = startDate.toLocaleDateString(locale, { year: 'numeric' });

  // Set the week display title to the capitalized month name followed by the year
  $('#week-display').text(`${capitalizedMonthName} ${year}`);

  await renderWeekDays(startDate, activeLocale); // Pass active locale and wait for rendering
}

async function renderWeekDays(startDate, locale) {
  const weekView = $('.week-view');
  weekView.empty(); // Clear previous days

  let weekendRow = null; // Variable to hold the weekend row element

  for (let i = 0; i < 7; i++) {
    const dayDate = addDays(startDate, i);
    const dayName = getDayName(dayDate, locale); // Get localized day name
    // Format date as "Day Month" (e.g., "15 avr.")
    const formattedDayDate = formatDate(dayDate, locale, { day: 'numeric', month: 'short' });
    const dateKey = formatDateKey(dayDate); // Key for IndexedDB

    // Load saved data for this day (includes goal, written, and text)
    const savedData = await loadData(dateKey);

    let dayHeaderContent;
    if (i < 5) { // Monday to Friday
      dayHeaderContent = `
        <div class="day-title">${dayName} ${formattedDayDate}</div>
        <div class="word-inputs" data-date-key="${dateKey}">
          <label>Objectif de mots: <input type="number" class="word-goal" value="${savedData ? savedData.goal : 0}"></label>
          <label>Mots écrits: <input type="number" class="words-written" value="${savedData ? savedData.written : 0}"></label>
        </div>
      `;
    } else { // Saturday and Sunday
       dayHeaderContent = `${dayName} ${formattedDayDate}`;
    }

    // Add the textarea to the day-content
    const dayContent = `
        <textarea class="day-text" data-date-key="${dateKey}" placeholder="Saisissez vos notes ici...">${savedData ? savedData.text : ''}</textarea>
    `;


    const dayElement = `
      <div class="day-column">
        <div class="day-header">${dayHeaderContent}</div>
        <div class="day-content">
          ${dayContent}
        </div>
      </div>
    `;

    if (i < 5) { // Monday to Friday
      weekView.append(dayElement);
    } else if (i === 5) { // Saturday
      weekendRow = $('<div class="weekend-row"></div>'); // Create the weekend container
      weekendRow.append(dayElement); // Add Saturday
    } else { // Sunday (i === 6)
      weekendRow.append(dayElement); // Add Sunday
      weekView.append(weekendRow); // Append the complete weekend row to the week view
    }
  }

  // Add event listeners to the newly created inputs and textareas
  $('.word-inputs input').on('change', handleInputChange);
  $('.day-text').on('input', handleTextareaInput); // Use 'input' for real-time saving
}

// Handle word count input change and save data
function handleInputChange() {
    const $input = $(this);
    const $wordInputsDiv = $input.closest('.word-inputs');
    const dateKey = $wordInputsDiv.data('date-key');

    if (dateKey) {
        // Load existing data first to merge
        loadData(dateKey).then(existingData => {
            const goal = $wordInputsDiv.find('.word-goal').val();
            const written = $wordInputsDiv.find('.words-written').val();
            // Merge with existing text data
            const newData = {
                ...existingData,
                goal: parseInt(goal) || 0,
                written: parseInt(written) || 0
            };
            saveData(dateKey, newData);
        });
    }
}

// Handle textarea input and save data
function handleTextareaInput() {
    const $textarea = $(this);
    const dateKey = $textarea.data('date-key');
    const text = $textarea.val();

    if (dateKey) {
        // Load existing data first to merge
        loadData(dateKey).then(existingData => {
             // Merge with existing word count data
            const newData = {
                ...existingData,
                text: text
            };
            saveData(dateKey, newData);
        });
    }
}


// --- Event Listeners ---

$('#prev-week').on('click', () => {
  currentWeekStart = addDays(currentWeekStart, -7);
  displayWeek(currentWeekStart, activeLocale); // Pass active locale
});

$('#next-week').on('click', () => {
  currentWeekStart = addDays(currentWeekStart, 7);
  displayWeek(currentWeekStart, activeLocale); // Pass active locale
});

// Add event listener for the "Aujourd'hui" button
$('#today-button').on('click', () => {
  currentWeekStart = getMonday(new Date()); // Get the start of the current week
  displayWeek(currentWeekStart, activeLocale); // Display the current week
});


// --- Initial Load ---
$(document).ready(async () => {
  // Open the database first
  await openDB();
  // Use the active locale for the initial display
  displayWeek(currentWeekStart, activeLocale);
});

// Remove default Vite counter setup if it exists
// setupCounter(document.querySelector('#counter')) // Remove or comment out this line
