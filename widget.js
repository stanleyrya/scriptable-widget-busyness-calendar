// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: pink; icon-glyph: magic;

//@ts-check

// use true to initially give Scriptable calendar access
// use false to open Calendar when script is run - when tapping on the widget
const debug = true;

// get widget params
const params = JSON.parse(args.widgetParameter) || { bg: "1121.jpg" };

// a separate image can be specified per widget in widget params:
// Long press on widget -> Edit Widget -> Parameter
// parameter config would look like this:
// { "bg": "2111.jpg", "view": "events" }
const imageName = params.bg;

// choose either a split view or show only one of them
const showEventsView = params.view ? params.view === "events" : true;
const showCalendarView = params.view ? params.view === "cal" : true;

const backgroundColor = "#000000";
const currentDayColor = "#FF0000";
const textColor = "#ffffff";
// opacity value for weekends and times
const opacity = 0.7;

// show or hide all day events
const showAllDayEvents = true;
// show calendar colored bullet for each event
const showCalendarBullet = true;
// week starts on a Sunday
const startWeekOnSunday = true;
// show events for the whole week or limit just to the day
const showEventsForWholeWeek = false;

// Uncomment if you do not want to use the automatic widget updater
// if (config.runsInWidget) {
//   let widget = await createWidget(params);
//   Script.setWidget(widget);
//   Script.complete();
// } else if (debug) {
//   Script.complete();
//   let widget = await createWidget(params);
//   await widget.presentMedium();
// } else {
//   const appleDate = new Date("2001/01/01");
//   const timestamp = (new Date().getTime() - appleDate.getTime()) / 1000;
//   console.log(timestamp);
//   const callback = new CallbackURL("calshow:" + timestamp);
//   callback.open();
//   Script.complete();
// }

async function createWidget(params) {
  const monthDiff = (params && params.monthDiff) ? params.monthDiff : 0;
  
  let widget = new ListWidget();
  widget.backgroundColor = new Color(backgroundColor);
  setWidgetBackground(widget, imageName);
  widget.setPadding(16, 16, 16, 16);
  
  const now = new Date();
  const monthToRender = new Date(now.getFullYear(), now.getMonth() + monthDiff, 1);
  
  const monthMap = await buildMonth(monthToRender);
  const weekMap = await buildWeeks(monthToRender);
  
  const freeDays = await getNextFreeDays(monthMap);
  console.log(freeDays);

  // layout horizontally
  const globalStack = widget.addStack();

  if (showEventsView) {
    await buildEventsView(globalStack, monthToRender, freeDays);
  }
  if (showCalendarView) {
    buildCalendarView(globalStack, monthToRender, weekMap);
  }

  return widget;
}

/**
 * Checks if the day is considered "busy"
 *
 * @param  {[CalendarEvent]} events - the events that are being processed
 */
async function isBusy(events) {
  for (const event of events) {
    if (event["title"] !== "Oncall") {
      return true;
    }
  }
  return false;
}

/**
 * Checks if oncall for the day
 *
 * @param  {[CalendarEvent]} events - the events that are being processed
 */
async function isOncall(events) {
  for (const event of events) {
    if (event["title"] === "Oncall") {
      return true;
    }
  }
  return false;
}

/**
 * Creates an object that describes a calendar day. Currently contains "isBusy" and "isOncall":
 * {"isBusy":true,"isOncall":true}
 *
 * @param  {Date} date - a date object that will be described
 */
async function buildDay(date) {
  let events = await CalendarEvent.between(
      new Date(date.getFullYear(), date.getMonth(), date.getDate()),
      new Date(date.getFullYear(), date.getMonth(), date.getDate()+1)
    );
  return {
      isBusy: await isBusy(events),
      isOncall: await isOncall(events)
  }
}

async function getNextFreeDays(monthMap) {
  const currentDay = new Date().getDate();
  const lastDateInMonth = await getLastDateOfMonth(new Date());
  const lastDayInMonth = lastDateInMonth.getDate();
  let freeDays = [];
  
  for (var i=currentDay; i<lastDayInMonth; i++) {
    if (monthMap[i] && !monthMap[i]["isBusy"]) {
      freeDays.push(i);
    }
  }
  
  return freeDays;
}

/**
 * Creates a map of days in the month to a description of said day. Currently contains "isBusy" and "isOncall":
 * {"1":{"isBusy":true,"isOncall":true},"2":...}
 *
 * @param  {Date} date - a date object that holds the current month
 */
async function buildMonth(date) {
  const lastDayInMonth = await getLastDateOfMonth(date);
  const daysInMonth = lastDayInMonth.getDate();
  let monthMap = {};
  let i=1;
  while (i<=daysInMonth) {
    monthMap[i] = await buildDay(new Date(date.getFullYear(), date.getMonth(), i));
    i++;
  }
  return monthMap;
}

/**
 * Creates a map of weeks in the month to an aggregated description of said week. Currently contains "isBusy" and "isOncall":
 * {"0":{"busyDays":3,"oncallDays":6},"1":...}
 *
 * @param  {Date} date - a date object that holds the current month
 */
async function buildWeeks(date) {
  const monthMap = buildMonth(date);
  const firstDayOfMonth = await getFirstDateOfMonth(date);
  const firstDayOfCalendar = startWeekOnSunday ? await getSundayOfWeek(firstDayOfMonth) : await getMondayOfWeek(firstDayOfMonth);

  let dateIterator = new Date(firstDayOfCalendar);
  let weekMap = {};
  let week = 0;
  
  while (dateIterator.getMonth() !== date.getMonth() + 1 || dateIterator.getDay() !== 0) {
    if (weekMap[week] === undefined) {
      weekMap[week] = {
        "busyDays": 0,
        "oncallDays": 0
      }
    }
    
    const day = await buildDay(dateIterator);
    weekMap[week]["busyDays"] += day["isBusy"]
    weekMap[week]["oncallDays"] += day["isOncall"]
    dateIterator = new Date(dateIterator.setDate(dateIterator.getDate() + 1));
    
    if (dateIterator.getDay() === 0) {
      week++;
    }
  }

  return weekMap;
}

/**
 * Gets the first date of the month
 *
 * @param  {Date} date - a date object that holds the current month
 *
 * @returns {Date} the first date of the month from the given date object
 */
async function getFirstDateOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/**
 * Gets the last date of the month
 *
 * @param  {Date} date - a date object that holds the current month
 *
 * @returns {Date} the last date of the month from the given date object
 */
async function getLastDateOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 0);
}

/**
 * Gets the Sunday of the given week
 *
 * @param  {Date} date - a date object for the week
 *
 * @returns {Date} the Sunday of the week from the given date object
 */
async function getSundayOfWeek(date) {
  const day = date.getDay();
  const diff = date.getDate() - day;
  return new Date(new Date(date).setDate(diff));
}

/**
 * Gets the Monday of the given week
 *
 * @param  {Date} date - a date object for the week
 *
 * @returns {Date} the Monday of the week from the given date object
 */
function getMondayOfWeek(date) {
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6:1);
  return new Date(new Date(date).setDate(diff));
}

/**
 * Builds the events view
 *
 * @param  {WidgetStack} stack - onto which the events view is built
 * @param  {Date} date - a date object that holds the current month
 */
async function buildEventsView(stack, date, freeDays) {
  const leftStack = stack.addStack();
  // push event view to the left
  stack.addSpacer();

  leftStack.layoutVertically();
  // center the whole left part of the widget
  leftStack.addSpacer();

  let events = [];
  if (showEventsForWholeWeek) {
    events = await CalendarEvent.thisWeek([]);
  } else {
    events = await CalendarEvent.today([]);
  }
  const futureEvents = [];
  // if we show events for the whole week, then we need to filter allDay events
  // to not show past allDay events
  for (const event of events) {
    if (
      (showAllDayEvents &&
        event.isAllDay &&
        event.startDate.getTime() >
          new Date(new Date().setDate(new Date().getDate() - 1))) ||
      (event.startDate.getTime() > date.getTime() &&
        !event.title.startsWith("Canceled:"))
    ) {
      futureEvents.push(event);
    }
  }

  // if we have events today; else if we don't
  if (futureEvents.length !== 0) {
    // show the next 3 events at most
    const numEvents = futureEvents.length > 3 ? 3 : futureEvents.length;
    for (let i = 0; i < numEvents; i += 1) {
      formatEvent(leftStack, futureEvents[i], textColor, opacity);
      // don't add a spacer after the last event
      if (i < numEvents - 1) {
        leftStack.addSpacer(8);
      }
    }
  } else {
    const text = showEventsForWholeWeek ? "this week" : "today";
    addWidgetTextLine(leftStack, `No more events ${text}.`, {
      color: textColor,
      opacity,
      font: Font.regularSystemFont(15),
      align: "left",
    });
  }
  // for centering
  leftStack.addSpacer();
}

/**
 * Builds the calendar view
 *
 * @param  {WidgetStack} stack - onto which the calendar is built
 * @param  {Date} date - a date object that holds the current month
 */
function buildCalendarView(stack, date, weekMap) {
  const rightStack = stack.addStack();
  rightStack.layoutVertically();

  const dateFormatter = new DateFormatter();
  dateFormatter.dateFormat = "MMMM";

  // if calendar is on a small widget make it a bit smaller to fit
  const spacing = config.widgetFamily === "small" ? 18 : 20;

  // Current month line
  const monthLine = rightStack.addStack();
  // since dates are centered in their squares we need to add some space
  monthLine.addSpacer(4);
  addWidgetTextLine(monthLine, dateFormatter.string(date).toUpperCase(), {
    color: textColor,
    textSize: 14,
    font: Font.boldSystemFont(13),
  });

  // between the month name and the week calendar
  rightStack.addSpacer(5);

  const calendarStack = rightStack.addStack();
  calendarStack.spacing = 2;

  const month = buildMonthVertical(date, weekMap);

  for (let i = 0; i < month.length; i += 1) {
    let weekdayStack = calendarStack.addStack();
    weekdayStack.layoutVertically();

    for (let j = 0; j < month[i].length; j += 1) {
      let dayStack = weekdayStack.addStack();
      dayStack.size = new Size(spacing, spacing);
      dayStack.centerAlignContent();

      const today = new Date();
      const isCurrentMonth = today.getMonth() === date.getMonth();
      if (isCurrentMonth && 
        month[i][j] === new Date().getDate().toString()) {
        const highlightedDate = getHighlightedDate(
          month[i][j],
          currentDayColor
        );
        dayStack.addImage(highlightedDate);
      } else {
        addWidgetTextLine(dayStack, `${month[i][j]}`, {
          color: textColor,
          opacity: isWeekend(i) ? opacity : 1,
          font: Font.boldSystemFont(10),
          align: "center",
        });
      }
    }
  }
}

/**
 * If the week starts on a Sunday indeces 0 and 6 are for weekends
 * else indices 5 and 6
 *
 * @param  {number} index
 */
function isWeekend(index) {
  if (startWeekOnSunday) {
    switch (index) {
      case 0:
      case 6:
        return true;
      default:
        return false;
    }
  }
  return index > 4;
}

/**
 * Creates an array of arrays, where the inner arrays include the same weekdays
 * along with an identifier in 0 position
 * [
 *   [ 'M', ' ', '7', '14', '21', '28' ],
 *   [ 'T', '1', '8', '15', '22', '29' ],
 *   [ 'W', '2', '9', '16', '23', '30' ],
 *   ...
 * ]
 *
 * @returns {Array<Array<string>>}
 */
function buildMonthVertical(date, weekMap) {
  const firstDayStack = new Date(date.getFullYear(), date.getMonth(), 1);
  const lastDayStack = new Date(date.getFullYear(), date.getMonth() + 1, 0);

  let month = [["M"], ["T"], ["W"], ["T"], ["F"], ["S"]];
  let index = 1;
  let offset = 1;

  if (startWeekOnSunday) {
    month.unshift(["S"]);
    index = 0;
    offset = 0;
  } else {
    month.push(["S"]);
  }

  let dayStackCounter = 0;

  // fill with empty slots
  for (; index < firstDayStack.getDay(); index += 1) {
    month[index - offset].push(" ");
    dayStackCounter = (dayStackCounter + 1) % 7;
  }

  for (let date = 1; date <= lastDayStack.getDate(); date += 1) {
    month[dayStackCounter].push(`${date}`);
    dayStackCounter = (dayStackCounter + 1) % 7;
  }

  const length = month.reduce(
    (acc, dayStacks) => (dayStacks.length > acc ? dayStacks.length : acc),
    0
  );
  month.forEach((dayStacks, index) => {
    while (dayStacks.length < length) {
      month[index].push(" ");
    }
  });
  
  month[7] = ['%'];
  for (const [key, value] of Object.entries(weekMap)) {
    const percentage = Math.round(100 * value["busyDays"] / 7);
    month[7].push(percentage);
  }

  return month;
}

/**
 * Draws a circle with a date on it for highlighting in calendar view
 *
 * @param  {string} date to draw into the circle
 *
 * @returns {Image} a circle with the date
 */
function getHighlightedDate(date, color) {
  const drawing = new DrawContext();
  drawing.respectScreenScale = true;
  const size = 50;
  drawing.size = new Size(size, size);
  drawing.opaque = false;
  drawing.setFillColor(new Color(color));
  drawing.fillEllipse(new Rect(1, 1, size - 2, size - 2));
  drawing.setFont(Font.boldSystemFont(25));
  drawing.setTextAlignedCenter();
  drawing.setTextColor(new Color("#ffffff"));
  drawing.drawTextInRect(date, new Rect(0, 10, size, size));
  const currentDayImg = drawing.getImage();
  return currentDayImg;
}

/**
 * formats the event times into just hours
 *
 * @param  {Date} date
 *
 * @returns {string} time
 */
function formatTime(date) {
  let dateFormatter = new DateFormatter();
  dateFormatter.useNoDateStyle();
  dateFormatter.useShortTimeStyle();
  return dateFormatter.string(date);
}

/**
 * Adds a event name along with start and end times to widget stack
 *
 * @param  {WidgetStack} stack - onto which the event is added
 * @param  {CalendarEvent} event - an event to add on the stack
 * @param  {number} opacity - text opacity
 */
function formatEvent(stack, event, color, opacity) {
  let eventLine = stack.addStack();

  if (showCalendarBullet) {
    // show calendar bulet in front of event name
    addWidgetTextLine(eventLine, "● ", {
      color: event.calendar.color.hex,
      font: Font.mediumSystemFont(14),
      lineLimit: 1,
    });
  }
  // event title
  addWidgetTextLine(eventLine, event.title, {
    color,
    font: Font.mediumSystemFont(14),
    lineLimit: 1,
  });
  // event duration
  let time;
  if (event.isAllDay) {
    time = "All Day";
  } else {
    time = `${formatTime(event.startDate)} - ${formatTime(event.endDate)}`;
  }

  const today = new Date().getDate();
  const eventDate = new Date(event.startDate).getDate();
  // if a future event is not today, we want to show it's date
  if (today !== eventDate) {
    time = `${eventDate}: ${time}`;
  }

  addWidgetTextLine(stack, time, {
    color,
    opacity,
    font: Font.regularSystemFont(14),
  });
}

function addWidgetTextLine(
  widget,
  text,
  {
    color = "#ffffff",
    textSize = 12,
    opacity = 1,
    align,
    font = "",
    lineLimit = 0,
  }
) {
  let textLine = widget.addText(text);
  textLine.textColor = new Color(color);
  if (typeof font === "string") {
    textLine.font = new Font(font, textSize);
  } else {
    textLine.font = font;
  }
  textLine.textOpacity = opacity;
  switch (align) {
    case "left":
      textLine.leftAlignText();
      break;
    case "center":
      textLine.centerAlignText();
      break;
    case "right":
      textLine.rightAlignText();
      break;
    default:
      textLine.leftAlignText();
      break;
  }
}

function getImageUrl(name) {
  let fm = FileManager.iCloud();
  let dir = fm.documentsDirectory();
  return fm.joinPath(dir, `${name}`);
}

function setWidgetBackground(widget, imageName) {
  const imageUrl = getImageUrl(imageName);
  widget.backgroundImage = Image.fromFile(imageUrl);
}

module.exports = {
    createWidget,
    clickWidget
}
