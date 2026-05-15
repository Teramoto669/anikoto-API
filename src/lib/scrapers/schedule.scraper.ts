import { fetchPage } from '../fetcher';
import { ScheduleDay, AnimeCard } from '../types';

/**
 * Scrape the weekly schedule block from the home page sidebar.
 * Falls back to /schedule if a dedicated page exists.
 */
export async function scrapeSchedule(): Promise<ScheduleDay[]> {
  const $ = await fetchPage('/home');

  const days: ScheduleDay[] = [];

  // The schedule block on the home page
  $('#schedule-block .schedule-day, .schedule-block .sch-item-head').each((_, dayEl) => {
    const $day = $(dayEl);
    const dayName = $day.find('.day-name, h3').text().trim();
    if (!dayName) return;

    const animes: AnimeCard[] = [];
    $day.next('.schedule-list, .schedule-items').find('.item, .flw-item').each((__, el) => {
      const $el = $(el);
      const href = $el.find('a').attr('href') ?? '';
      animes.push({
        id: $el.find('[data-tip]').attr('data-tip') ?? href,
        title: $el.find('.name, .d-title').text().trim(),
        image: $el.find('img').attr('src') ?? '',
        href,
        type: $el.find('.type').text().trim() || undefined,
      });
    });

    days.push({ day: dayName, animes });
  });

  return days;
}
