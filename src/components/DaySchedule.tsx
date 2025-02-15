import React, { useEffect, useState } from 'react';
import './DaySchedule.css';

interface ScheduleEvent {
  startTime: string;  // Format: "HH:mm AM/PM"
  endTime?: string;   // Format: "HH:mm AM/PM", optional for events that don't have an explicit end time
  title: string;
  type: 'mandatory' | 'buffer' | 'practice' | 'qualifying' | 'eliminations' | 'break' | 'other';
  details?: string;   // Optional additional details about the event
  group?: string;     // Optional group identifier
}

interface DayScheduleProps {
  date: string;       // Format: "Day DD/MM"
  events: ScheduleEvent[];
  className?: string;
}

const PIXELS_PER_MINUTE = 6; // Doubled from 2 to 4
const DEFAULT_EVENT_DURATION = 15; // Default duration in minutes for events without endTime
const HOURS_BEFORE = 2; // Hours to show before current time
const MINUTES_PER_HOUR = 60;
const VISIBLE_WINDOW_START = HOURS_BEFORE * MINUTES_PER_HOUR;

const DaySchedule: React.FC<DayScheduleProps> = ({ 
  date, 
  events, 
  className = '' 
}: DayScheduleProps) => {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute

    return () => clearInterval(timer);
  }, []);

  // Helper function to get background color based on event type
  const getEventColor = (type: ScheduleEvent['type']): string => {
    switch (type) {
      case 'mandatory':
        return '#1a472a';  // Dark green
      case 'buffer':
        return '#2a2a2a';  // Dark gray
      case 'practice':
        return '#1a3a4a';  // Dark blue
      case 'qualifying':
        return 'rgb(66, 13, 35)';  // Dark gold
      case 'eliminations':
        return '#4a1a1a';  // Dark red
      case 'break':
        return 'rgb(157, 71, 19)';  // Dark purple
      default:
        return '#1a1a1a';  // Very dark gray
    }
  };

  // Helper function to parse time string to minutes since midnight
  const parseTimeToMinutes = (timeStr: string): number => {
    try {
      const normalizedTime = timeStr.toLowerCase().replace(/\s+/g, '');
      const match = normalizedTime.match(/(\d+):?(\d+)?(?:am|pm)?/);
      
      if (!match) return 0;
      
      let hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2] || '0', 10);
      
      if (normalizedTime.includes('pm') && hours !== 12) {
        hours += 12;
      } else if (normalizedTime.includes('am') && hours === 12) {
        hours = 0;
      }
      
      return hours * 60 + minutes;
    } catch (error) {
      console.error('Error parsing time:', timeStr, error);
      return 0;
    }
  };

  // Helper function to calculate event duration in minutes
  const getEventDuration = (event: ScheduleEvent): number => {
    if (!event.endTime) return DEFAULT_EVENT_DURATION;
    
    const startMinutes = parseTimeToMinutes(event.startTime);
    const endMinutes = parseTimeToMinutes(event.endTime);
    
    // Handle case where end time is on the next day
    const duration = endMinutes >= startMinutes 
      ? endMinutes - startMinutes 
      : (24 * 60) - startMinutes + endMinutes;
      
    return Math.max(duration, DEFAULT_EVENT_DURATION);
  };

  // Sort events by start time
  const sortedEvents = [...events].sort((a, b) => 
    parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime)
  );

  // Find the earliest and latest times to calculate total timeline height
  const startMinutes = Math.min(...sortedEvents.map(e => parseTimeToMinutes(e.startTime)));
  const endMinutes = Math.max(...sortedEvents.map(e => {
    if (e.endTime) return parseTimeToMinutes(e.endTime);
    return parseTimeToMinutes(e.startTime) + DEFAULT_EVENT_DURATION;
  }));

  // Helper function to get current time in minutes since midnight
  const getCurrentTimeMinutes = (): number => {
    return currentTime.getHours() * 60 + currentTime.getMinutes();
  };

  // Calculate the visible time window
  const currentMinutes = getCurrentTimeMinutes();
  const windowStart = currentMinutes - VISIBLE_WINDOW_START;
  
  // Filter events to only show those after the window start
  const visibleEvents = sortedEvents.filter(event => {
    const eventStart = parseTimeToMinutes(event.startTime);
    const eventEnd = event.endTime 
      ? parseTimeToMinutes(event.endTime)
      : eventStart + DEFAULT_EVENT_DURATION;
    
    // Handle events that cross midnight
    const normalizedEventEnd = eventEnd < eventStart 
      ? eventEnd + (24 * MINUTES_PER_HOUR) 
      : eventEnd;

    return normalizedEventEnd >= windowStart;
  });

  // Calculate timeline height based on the last event of the day
  const lastEventTime = Math.max(...visibleEvents.map(event => {
    const eventEnd = event.endTime 
      ? parseTimeToMinutes(event.endTime)
      : parseTimeToMinutes(event.startTime) + DEFAULT_EVENT_DURATION;
    return eventEnd;
  }));

  const timelineHeight = (lastEventTime - windowStart) * PIXELS_PER_MINUTE;
  const currentTimePosition = VISIBLE_WINDOW_START * PIXELS_PER_MINUTE; // Position current time at 1/3 of the height

  return (
    <div className={`day-schedule ${className}`}>
      <div className="schedule-header">
        <h2>{date}</h2>
      </div>
      <div 
        className="schedule-events"
        style={{
          height: timelineHeight,
          position: 'relative'
        }}
      >
        <div 
          className="current-time-indicator"
          style={{
            position: 'absolute',
            top: currentTimePosition,
            left: -4,
            right: -4,
            height: '2px',
            backgroundColor: '#ff0000',
            boxShadow: '0 0 8px rgba(255, 0, 0, 0.5)',
            zIndex: 2
          }}
        >
          <div 
            className="current-time-dot"
            style={{
              position: 'absolute',
              left: -3,
              top: -2,
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: '#ff0000',
              boxShadow: '0 0 8px rgba(255, 0, 0, 0.8)'
            }}
          />
        </div>
        {visibleEvents.map((event: ScheduleEvent, index: number) => {
          const eventStart = parseTimeToMinutes(event.startTime);
          const duration = getEventDuration(event);
          
          // Calculate position relative to the window
          const relativeStart = eventStart - windowStart;
          
          return (
            <div
              key={`${event.startTime}-${index}`}
              className="schedule-event"
              style={{
                backgroundColor: getEventColor(event.type),
                padding: '4px',
                borderRadius: '4px',
                border: '1px solid rgba(0, 0, 0, 0.1)',
                position: 'absolute',
                top: relativeStart * PIXELS_PER_MINUTE,
                height: Math.max(duration * PIXELS_PER_MINUTE - 4, 20),
                left: 0,
                right: 0
              }}
            >
              <div className="event-content">
                <span className="event-time">
                  {event.startTime.split(' ')[0]}
                </span>
                <div className="event-description-wrapper">
                  <span className="event-description">
                    {event.title}
                    {event.group && <span className="event-group"> ({event.group})</span>}
                    {event.details && (
                      <span className="event-details"> {event.details}</span>
                    )}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DaySchedule; 