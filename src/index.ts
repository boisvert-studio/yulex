import { startCoverflow } from './coverflow';
import { startHomeTeam } from './home-team';
import { startPrevNext } from './prevnext';
import { startRelated } from './related';

window.Webflow ||= [];
window.Webflow.push(() => {
  // Modules start here, each keyed on a data attribute and a no-op when it is absent.
  startCoverflow();
  startHomeTeam();
  startPrevNext();
  startRelated();
});
