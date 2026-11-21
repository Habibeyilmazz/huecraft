// Static sample UI for the Preview tab. It is styled by preview.css, which uses
// nothing but the exported custom properties, so what you see is what the
// tokens produce. The shop and its bookings are made up.

const icon = (path: string) =>
  `<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
const ICONS = {
  success: icon('<circle cx="10" cy="10" r="7.5"/><path d="m6.8 10.2 2.2 2.2 4.2-4.6"/>'),
  warning: icon('<path d="M10 3 2.5 16h15L10 3Z"/><path d="M10 8.5v3.5M10 14.2v.1"/>'),
  danger: icon('<circle cx="10" cy="10" r="7.5"/><path d="m7.5 7.5 5 5m0-5-5 5"/>'),
  info: icon('<circle cx="10" cy="10" r="7.5"/><path d="M10 9.2v4.3M10 6.5v.1"/>'),
};

const WEEK: [day: string, bookings: number][] = [
  ['Mon', 11], ['Tue', 14], ['Wed', 9], ['Thu', 17], ['Fri', 23], ['Sat', 31], ['Sun', 23],
];
const PEAK = Math.max(...WEEK.map(([, n]) => n));

const BOOKINGS: [ref: string, rider: string, bike: string, due: string, status: keyof typeof ICONS, label: string][] = [
  ['FH-2041', 'Mara Lindqvist', 'Gravel, medium', 'Today, 17:00', 'info', 'Out'],
  ['FH-2040', 'Tomás Rey', 'City, large', 'Today, 12:30', 'danger', 'Late'],
  ['FH-2039', 'Ines Okoro', 'E-bike, small', 'Yesterday', 'success', 'Returned'],
  ['FH-2038', 'Jun Watanabe', 'Tandem', 'Yesterday', 'success', 'Returned'],
  ['FH-2037', 'Bea Novak', 'Kids, 24 inch', 'Fri 14 Mar', 'warning', 'Service due'],
];

const alert = (kind: keyof typeof ICONS, title: string, body: string) => `
  <div class="pv-alert pv-${kind}">
    ${ICONS[kind]}
    <p><strong>${title}</strong> ${body}</p>
  </div>`;

export const PREVIEW_HTML = `
<div class="pv">
  <section class="pv-card pv-dash" aria-labelledby="pv-dash-title">
    <header class="pv-card-head">
      <div>
        <h3 id="pv-dash-title">Fernhill Bike Hire</h3>
        <p class="pv-muted">Week of 10 March</p>
      </div>
      <div class="pv-actions">
        <button type="button" class="pv-btn pv-btn-secondary">Export week</button>
        <button type="button" class="pv-btn pv-btn-primary">New booking</button>
      </div>
    </header>

    <dl class="pv-stats">
      <div><dt>Bookings</dt><dd><b>128</b><span><span class="pv-badge pv-success">Up 12%</span> on last week</span></dd></div>
      <div><dt>Bikes out now</dt><dd><b>34</b><span>of 60 in the fleet</span></dd></div>
      <div><dt>Late returns</dt><dd><b>3</b><span><span class="pv-badge pv-danger">Call riders</span></span></dd></div>
    </dl>

    <figure class="pv-chart">
      <figcaption>Bookings per day</figcaption>
      <ol>
        ${WEEK.map(([day, n]) => `<li${n === PEAK ? ' class="is-peak"' : ''}><span class="pv-col"><b>${n}</b><span class="pv-bar" style="height:${Math.round((n / PEAK) * 84)}%"></span></span><span>${day}</span></li>`).join('')}
      </ol>
    </figure>

    <div class="pv-table-wrap" tabindex="0" role="region" aria-label="Recent bookings">
      <table class="pv-table">
        <thead><tr><th scope="col">Booking</th><th scope="col">Rider</th><th scope="col">Bike</th><th scope="col">Due back</th><th scope="col">Status</th></tr></thead>
        <tbody>
          ${BOOKINGS.map(([ref, rider, bike, due, status, label]) => `<tr><th scope="row"><a href="#preview">${ref}</a></th><td>${rider}</td><td>${bike}</td><td>${due}</td><td><span class="pv-badge pv-${status}">${label}</span></td></tr>`).join('')}
        </tbody>
      </table>
    </div>
  </section>

  <form class="pv-card pv-form" aria-labelledby="pv-form-title" novalidate>
    <h3 id="pv-form-title">New booking</h3>
    <div class="pv-field">
      <label for="pv-name">Rider name</label>
      <input id="pv-name" type="text" value="Mara Lindqvist" autocomplete="off" />
    </div>
    <div class="pv-field">
      <label for="pv-email">Email</label>
      <input id="pv-email" type="email" value="mara@fernhill" aria-invalid="true" aria-describedby="pv-email-error" autocomplete="off" />
      <p class="pv-error" id="pv-email-error">${ICONS.danger} Enter a full address, like mara@fernhill.example</p>
    </div>
    <div class="pv-field">
      <label for="pv-bike">Bike</label>
      <select id="pv-bike"><option>Gravel, medium</option><option>City, large</option><option>E-bike, small</option><option>Tandem</option></select>
      <p class="pv-hint">4 of this model are free today.</p>
    </div>
    <div class="pv-field">
      <label for="pv-days">Days</label>
      <input id="pv-days" type="number" min="1" max="14" value="2" />
    </div>
    <fieldset class="pv-field">
      <legend>Pick-up</legend>
      <label class="pv-choice"><input type="radio" name="pv-pickup" checked /> At the shop</label>
      <label class="pv-choice"><input type="radio" name="pv-pickup" /> Delivered to the rider</label>
    </fieldset>
    <label class="pv-choice"><input type="checkbox" checked /> Add a helmet, no charge</label>
    <div class="pv-field">
      <label for="pv-notes">Notes for the workshop</label>
      <textarea id="pv-notes" rows="3">Lower the saddle and fit the pannier rack.</textarea>
    </div>
    <div class="pv-actions">
      <button type="submit" class="pv-btn pv-btn-primary">Save booking</button>
      <button type="button" class="pv-btn pv-btn-quiet">Cancel</button>
    </div>
  </form>

  <section class="pv-card pv-kit" aria-labelledby="pv-kit-title">
    <h3 id="pv-kit-title">Buttons and messages</h3>
    <div class="pv-row">
      <button type="button" class="pv-btn pv-btn-primary">Primary</button>
      <button type="button" class="pv-btn pv-btn-secondary">Secondary</button>
      <button type="button" class="pv-btn pv-btn-quiet">Quiet</button>
      <button type="button" class="pv-btn pv-btn-danger">Delete</button>
      <button type="button" class="pv-btn pv-btn-primary" disabled>Disabled</button>
    </div>
    <div class="pv-row">
      <span class="pv-badge pv-primary">New</span>
      <span class="pv-badge pv-success">Returned</span>
      <span class="pv-badge pv-warning">Service due</span>
      <span class="pv-badge pv-danger">Late</span>
      <span class="pv-badge pv-info">Out</span>
      <span class="pv-badge">Draft</span>
    </div>
    ${alert('success', 'Booking saved.', 'A confirmation is on its way to the rider.')}
    ${alert('warning', 'Two bikes are due a service.', 'Book them in before the weekend.')}
    ${alert('danger', 'The card was declined.', 'Ask the rider for another way to pay.')}
    ${alert('info', 'Rain is forecast on Saturday.', 'Expect some riders to move their dates.')}
  </section>

  <article class="pv-card pv-article">
    <p class="pv-muted">Route notes, 6 minute read</p>
    <h3>The coast road, without the headwind</h3>
    <p class="pv-lead">Leave before nine, ride north first, and let the afternoon wind push you home.</p>
    <p>The loop from the harbour to the lighthouse is 38 kilometres and almost flat, which is why it is our
      <a href="#preview">most booked route</a>. What catches riders out is the wind: by early afternoon it blows
      steadily from the north-west.</p>
    <blockquote>Ride into the wind while your legs are fresh. Nobody regrets a tailwind at the end of the day.</blockquote>
    <h4>What to pack</h4>
    <ul>
      <li>A windproof layer, even in July</li>
      <li>Two bottles: the only tap is at the lighthouse</li>
      <li>The paper map from the shop, for the stretch with no signal</li>
    </ul>
  </article>
</div>`;
