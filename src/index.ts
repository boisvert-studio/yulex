import { startCoverflow } from './coverflow';
import { startDates } from './dates';
import { startHomeTeam } from './home-team';
import { startPrevNext } from './prevnext';
import { startRelated } from './related';
import { startVideo } from './video';

window.Webflow ||= [];
window.Webflow.push(() => {
  // Modules start here, each keyed on a data attribute and a no-op when it is absent.
  startCoverflow();
  startDates();
  startHomeTeam();
  startPrevNext();
  startRelated();
  startVideo();
});
