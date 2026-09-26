import * as Popover from "@radix-ui/react-popover";
import * as Select from "@radix-ui/react-select";
import { useId, useState } from "react";
import type { ActiveTaskStatus, TaskPriority, UserPreview } from "@ksat/contracts";
import { Avatar } from "../../components/Avatar/Avatar";
import calendarIcon from "../../assets/tasks/calendar.svg";
import checkIcon from "../../assets/tasks/check.svg";
import pillChevron from "../../assets/tasks/pill-chevron.svg";
import priorityIcon from "../../assets/tasks/priority-bars.svg";
import { TASK_COLUMNS, PRIORITY_LABELS, describeDueDate } from "./taskBoard";
import type { BoardMemberOption } from "./useBoardMembers";
import styles from "./PropertyPills.module.scss";

const STATUS_TONE: Record<ActiveTaskStatus, string> = {
  NOT_STARTED: styles.dotNotStarted,
  IN_PROGRESS: styles.dotInProgress,
  COMPLETED: styles.dotCompleted,
};

interface PillTriggerProps {
  readonly label: string;
  readonly disabled?: boolean;
  readonly invalid?: boolean;
  readonly children: React.ReactNode;
}

/** Shared trigger chrome for every property pill: icon/content, then a chevron. */
function PillTrigger({ label, disabled, invalid, children }: PillTriggerProps) {
  return (
    <Select.Trigger
      className={styles.trigger}
      aria-label={label}
      aria-invalid={invalid ? "true" : "false"}
      disabled={disabled}
    >
      {children}
      <Select.Icon className={styles.chevron}>
        <img src={pillChevron} alt="" width={10} height={6} />
      </Select.Icon>
    </Select.Trigger>
  );
}

function SelectMenu({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <Select.Portal>
      <Select.Content className={styles.content} position="popper" sideOffset={6}>
        <Select.Viewport>
          <Select.Group>
            <Select.Label className={styles.heading}>{heading}</Select.Label>
            {children}
          </Select.Group>
        </Select.Viewport>
      </Select.Content>
    </Select.Portal>
  );
}

function MenuItem({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <Select.Item className={styles.item} value={value}>
      {children}
      <Select.ItemIndicator className={styles.itemCheck}>
        <img src={checkIcon} alt="" width={12} height={12} />
      </Select.ItemIndicator>
    </Select.Item>
  );
}

interface StatusPillProps {
  readonly value: ActiveTaskStatus;
  readonly onChange: (value: ActiveTaskStatus) => void;
  readonly disabled?: boolean;
}

export function StatusPill({ value, onChange, disabled }: StatusPillProps) {
  const current = TASK_COLUMNS.find((column) => column.status === value);
  return (
    <Select.Root
      value={value}
      onValueChange={(next) => onChange(next as ActiveTaskStatus)}
      disabled={disabled}
    >
      <PillTrigger label="Status">
        <span className={`${styles.dot} ${STATUS_TONE[value]}`} aria-hidden="true" />
        <Select.Value>{current?.title ?? value}</Select.Value>
      </PillTrigger>
      <SelectMenu heading="Change status">
        {TASK_COLUMNS.map((column) => (
          <MenuItem key={column.status} value={column.status}>
            <span className={`${styles.dot} ${STATUS_TONE[column.status]}`} aria-hidden="true" />
            <Select.ItemText>{column.title}</Select.ItemText>
          </MenuItem>
        ))}
      </SelectMenu>
    </Select.Root>
  );
}

interface PriorityPillProps {
  readonly value: TaskPriority;
  readonly onChange: (value: TaskPriority) => void;
  readonly disabled?: boolean;
}

export function PriorityPill({ value, onChange, disabled }: PriorityPillProps) {
  return (
    <Select.Root
      value={value}
      onValueChange={(next) => onChange(next as TaskPriority)}
      disabled={disabled}
    >
      <PillTrigger label="Priority">
        <img src={priorityIcon} alt="" width={12} height={12} className={styles.priorityIcon} />
        <Select.Value>{PRIORITY_LABELS[value]}</Select.Value>
      </PillTrigger>
      <SelectMenu heading="Change priority">
        {(Object.keys(PRIORITY_LABELS) as TaskPriority[]).map((priority) => (
          <MenuItem key={priority} value={priority}>
            <Select.ItemText>{PRIORITY_LABELS[priority]}</Select.ItemText>
          </MenuItem>
        ))}
      </SelectMenu>
    </Select.Root>
  );
}

const UNASSIGNED = "__unassigned__";

interface AssigneePillProps {
  readonly value: UserPreview | null;
  readonly members: readonly BoardMemberOption[];
  readonly onChange: (member: UserPreview | null) => void;
  readonly invalid?: boolean;
  readonly disabled?: boolean;
}

/** Assignee is optional: an explicit "Unassigned" option sits above the roster. */
export function AssigneePill({ value, members, onChange, invalid, disabled }: AssigneePillProps) {
  return (
    <Select.Root
      value={value?.id ?? UNASSIGNED}
      onValueChange={(next) => {
        if (next === UNASSIGNED) {
          onChange(null);
          return;
        }
        const member = members.find((candidate) => candidate.id === next);
        if (member) onChange(member);
      }}
      disabled={disabled}
    >
      <PillTrigger label="Assignee" invalid={invalid}>
        {value ? (
          <Avatar seed={value.avatarSeed} name={value.name} size={16} decorative />
        ) : (
          <span className={styles.unassignedDot} aria-hidden="true" />
        )}
        <Select.Value>{value?.name ?? "Unassigned"}</Select.Value>
      </PillTrigger>
      <SelectMenu heading="Assign to">
        <MenuItem value={UNASSIGNED}>
          <Select.ItemText>Unassigned</Select.ItemText>
        </MenuItem>
        {members.map((member) => (
          <MenuItem key={member.id} value={member.id}>
            <Avatar seed={member.avatarSeed} name={member.name} size={16} decorative />
            <Select.ItemText>
              {member.name} ({roleLabel(member.role)})
            </Select.ItemText>
          </MenuItem>
        ))}
      </SelectMenu>
    </Select.Root>
  );
}

interface ReporterPillProps {
  readonly value: UserPreview;
  readonly members: readonly BoardMemberOption[];
  readonly onChange: (member: UserPreview) => void;
  readonly invalid?: boolean;
  readonly disabled?: boolean;
}

/** Reporter always has a value: any active board member may set any active member. */
export function ReporterPill({ value, members, onChange, invalid, disabled }: ReporterPillProps) {
  return (
    <Select.Root
      value={value.id}
      onValueChange={(next) => {
        const member = members.find((candidate) => candidate.id === next);
        if (member) onChange(member);
      }}
      disabled={disabled}
    >
      <PillTrigger label="Reporter" invalid={invalid}>
        <Avatar seed={value.avatarSeed} name={value.name} size={16} decorative />
        <Select.Value>Reporter: {value.name}</Select.Value>
      </PillTrigger>
      <SelectMenu heading="Reported by">
        {members.map((member) => (
          <MenuItem key={member.id} value={member.id}>
            <Avatar seed={member.avatarSeed} name={member.name} size={16} decorative />
            <Select.ItemText>
              {member.name} ({roleLabel(member.role)})
            </Select.ItemText>
          </MenuItem>
        ))}
      </SelectMenu>
    </Select.Root>
  );
}

function roleLabel(role: "ADMIN" | "MANAGER" | "CONTRIBUTOR"): string {
  if (role === "ADMIN") return "Admin";
  if (role === "MANAGER") return "Manager";
  return "Contributor";
}

interface DueDatePillProps {
  readonly value: string | null;
  readonly onChange: (value: string | null) => void;
  readonly disabled?: boolean;
  readonly now?: Date;
}

export function DueDatePill({ value, onChange, disabled, now }: DueDatePillProps) {
  const [open, setOpen] = useState(false);
  const inputId = useId();
  const info = describeDueDate(value, now);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger className={styles.trigger} aria-label="Due date" disabled={disabled}>
        <img src={calendarIcon} alt="" width={13} height={13} />
        <span>{info?.label ?? "No due date"}</span>
        {info ? (
          <span className={`${styles.badge} ${styles[`badge${capitalize(info.tone)}`]}`}>
            {info.badge}
          </span>
        ) : null}
        <img src={pillChevron} alt="" width={10} height={6} className={styles.chevron} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className={styles.datePopover} sideOffset={6}>
          <label className={styles.dateLabel} htmlFor={inputId}>
            Due date
          </label>
          <input
            className={styles.dateInput}
            id={inputId}
            type="date"
            value={value ?? ""}
            onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)}
          />
          <button
            className={styles.clearButton}
            type="button"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
          >
            Clear due date
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
