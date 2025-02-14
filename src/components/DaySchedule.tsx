import React from 'react';
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

const DaySchedule: React.FC<DayScheduleProps> = ({ 
  date, 
  events, 
  className = '' 
}: DayScheduleProps) => {
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
        return '#4a3a1a';  // Dark gold
      case 'eliminations':
        return '#4a1a1a';  // Dark red
      case 'break':
        return '#3a1a4a';  // Dark purple
      default:
        return '#1a1a1a';  // Very dark gray
    }
  };

  // Helper function to format time range
  const formatTimeRange = (event: ScheduleEvent): string => {
    if (!event.endTime) return event.startTime;
    return `(${event.startTime} - ${event.endTime})`;
  };

  return (
    <div className={`day-schedule ${className}`}>
      <div className="schedule-header">
        <h2>{date}</h2>
      </div>
      <div className="schedule-events">
        {events.map((event: ScheduleEvent, index: number) => (
          <div
            key={`${event.startTime}-${index}`}
            className="schedule-event"
            style={{
              backgroundColor: getEventColor(event.type),
              padding: '8px',
              margin: '4px 0',
              borderRadius: '4px',
              border: '1px solid rgba(0, 0, 0, 0.1)'
            }}
          >
            <div className="event-time">
              {event.startTime}
              {event.group && <span className="event-group"> - {event.group}</span>}
            </div>
            <div className="event-title">
              {event.title}
              {event.details && (
                <span className="event-details"> {formatTimeRange(event)}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DaySchedule; 