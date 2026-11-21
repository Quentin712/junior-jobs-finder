const form = document.getElementById('search-form');
const keywordBox = document.getElementById('keyword');
const countryBox = document.getElementById('country');
const levelBox = document.getElementById('level');
const tools = document.getElementById('tools');
const filterText = document.getElementById('filter-text');
const contractFilter = document.getElementById('contract-filter');
const sortBox = document.getElementById('sort');
const salaryOnly = document.getElementById('salary-only');
const message = document.getElementById('message');
const summary = document.getElementById('summary');
const resultsList = document.getElementById('results');
const pager = document.getElementById('pager');
const prevButton = document.getElementById('prev');
const nextButton = document.getElementById('next');
const pageLabel = document.getElementById('page-label');

const MAX_PAGE = 5;
const CURRENCY = { gb: '£', us: '$', ca: '$', de: '€', fr: '€' };

let allJobs = [];
let currentPage = 1;
let searchedCountry = 'gb';

/*
Shows a message to the user. Red text if it is an error.
*/
function showMessage(text, isError) {
  message.textContent = text;
  message.className = isError ? 'error' : '';
}

/*
Asks our own server for jobs, then draws them on the page.
*/
async function loadJobs(page) {
  const params = new URLSearchParams({
    country: countryBox.value,
    level: levelBox.value,
    keyword: keywordBox.value.trim(),
    page: page
  });

  showMessage('Loading jobs...', false);
  resultsList.innerHTML = '';
  summary.textContent = '';

  try {
    const reply = await fetch('/api/jobs?' + params);
    const data = await reply.json();

    if (!reply.ok) {
      showMessage(data.error || 'Something went wrong.', true);
      return;
    }

    allJobs = data.jobs;
    currentPage = page;
    searchedCountry = countryBox.value;
    showMessage('', false);
    tools.hidden = false;
    pager.hidden = false;
    draw();
  } catch (err) {
    showMessage('Could not reach the server. Check your connection and try again.', true);
  }
}

/*
Keeps only the jobs that match the filters the user picked.
*/
function filterJobs(list) {
  const text = filterText.value.trim().toLowerCase();
  const contract = contractFilter.value;

  return list.filter(job => {
    if (text && !(job.title + ' ' + job.company).toLowerCase().includes(text)) {
      return false;
    }
    if (contract === 'unknown' && job.contractTime) return false;
    if (contract !== 'all' && contract !== 'unknown' && job.contractTime !== contract) {
      return false;
    }
    if (salaryOnly.checked && !job.salaryMin && !job.salaryMax) return false;
    return true;
  });
}

/*
Returns a sorted copy of the list. The original list is not changed.
*/
function sortJobs(list, how) {
  const sorted = [...list];
  if (how === 'newest') {
    sorted.sort((a, b) => new Date(b.posted) - new Date(a.posted));
  } else if (how === 'title') {
    sorted.sort((a, b) => a.title.localeCompare(b.title));
  } else if (how === 'company') {
    sorted.sort((a, b) => a.company.localeCompare(b.company));
  } else if (how === 'salary') {
    sorted.sort((a, b) => (b.salaryMax || 0) - (a.salaryMax || 0));
  }
  return sorted;
}

/*
Turns the salary numbers into a short piece of text.
*/
function formatSalary(job) {
  const symbol = CURRENCY[searchedCountry] || '';
  if (!job.salaryMin && !job.salaryMax) return 'Salary not listed';
  const low = Math.round(job.salaryMin || job.salaryMax).toLocaleString();
  const high = Math.round(job.salaryMax || job.salaryMin).toLocaleString();
  if (low === high) return symbol + low + ' per year';
  return symbol + low + ' to ' + symbol + high + ' per year';
}

/*
Makes a paragraph with the given text and class name.
*/
function makeLine(text, className) {
  const p = document.createElement('p');
  p.textContent = text;
  if (className) p.className = className;
  return p;
}

/*
Builds the card for one job. Text is added with textContent,
so nothing from the API can run as code on our page.
*/
function makeCard(job) {
  const card = document.createElement('li');
  card.className = 'job';

  const title = document.createElement('h2');
  title.textContent = job.title;
  card.appendChild(title);

  card.appendChild(makeLine(job.company + ' in ' + job.location, 'meta'));
  card.appendChild(makeLine(formatSalary(job), ''));

  const contract = job.contractTime ? job.contractTime.replace('_', ' ') : 'contract not stated';
  const posted = new Date(job.posted).toLocaleDateString();
  card.appendChild(makeLine(contract + ', posted ' + posted, 'meta'));

  if (job.link && job.link.startsWith('http')) {
    const link = document.createElement('a');
    link.href = job.link;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'View on Adzuna';
    card.appendChild(link);
  }

  return card;
}

/*
Applies the filters and sorting, then redraws the list.
*/
function draw() {
  const shown = sortJobs(filterJobs(allJobs), sortBox.value);

  resultsList.innerHTML = '';
  shown.forEach(job => resultsList.appendChild(makeCard(job)));

  summary.textContent = 'Showing ' + shown.length + ' of ' + allJobs.length + ' jobs on this page.';
  if (allJobs.length === 0) {
    showMessage('No jobs found. Try a different keyword, level, or country.', false);
  } else if (shown.length === 0) {
    showMessage('No jobs match your filters. Try loosening them.', false);
  } else {
    showMessage('', false);
  }

  pageLabel.textContent = 'Page ' + currentPage;
  prevButton.disabled = currentPage <= 1;
  nextButton.disabled = currentPage >= MAX_PAGE || allJobs.length === 0;
}

form.addEventListener('submit', event => {
  event.preventDefault();
  loadJobs(1);
});
prevButton.addEventListener('click', () => loadJobs(currentPage - 1));
nextButton.addEventListener('click', () => loadJobs(currentPage + 1));
[filterText, contractFilter, sortBox, salaryOnly].forEach(item => {
  item.addEventListener('input', draw);
});

loadJobs(1);
