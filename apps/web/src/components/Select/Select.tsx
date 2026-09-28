import * as SelectPrimitive from "@radix-ui/react-select";
import checkIcon from "../../assets/tasks/check.svg";
import chevronIcon from "../../assets/tasks/select-chevron.svg";
import styles from "./Select.module.scss";

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

export interface SelectGroup {
  readonly label: string;
  readonly options: readonly SelectOption[];
}

interface SelectProps {
  readonly label: string;
  readonly value: string;
  /** A single list headed by `label`. Ignored when `groups` is supplied. */
  readonly options?: readonly SelectOption[];
  /** Several headed lists, such as time zones by region. */
  readonly groups?: readonly SelectGroup[];
  readonly onChange: (value: string) => void;
  readonly disabled?: boolean;
  /** Extra trigger class for layout (for example a full-width field). */
  readonly className?: string;
  readonly describedBy?: string;
}

/** Shared Radix select used by board filters and task forms; task property pills use the same primitive behavior. */
export function Select({
  label,
  value,
  options = [],
  groups,
  onChange,
  disabled,
  className,
  describedBy,
}: SelectProps) {
  const sections = groups ?? [{ label, options }];
  return (
    <SelectPrimitive.Root value={value} onValueChange={onChange} disabled={disabled}>
      <SelectPrimitive.Trigger
        className={className === undefined ? styles.trigger : `${styles.trigger} ${className}`}
        aria-label={label}
        aria-describedby={describedBy}
      >
        <SelectPrimitive.Value />
        <SelectPrimitive.Icon className={styles.icon}>
          <img src={chevronIcon} alt="" width={18} height={18} />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content className={styles.content} position="popper" sideOffset={6}>
          <SelectPrimitive.Viewport className={styles.viewport}>
            {sections.map((section) => (
              <SelectPrimitive.Group key={section.label}>
                <SelectPrimitive.Label className={styles.heading}>
                  {section.label}
                </SelectPrimitive.Label>
                {section.options.map((option) => (
                  <SelectPrimitive.Item
                    className={styles.item}
                    key={option.value}
                    value={option.value}
                  >
                    <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                    <SelectPrimitive.ItemIndicator className={styles.check}>
                      <img src={checkIcon} alt="" width={12} height={12} />
                    </SelectPrimitive.ItemIndicator>
                  </SelectPrimitive.Item>
                ))}
              </SelectPrimitive.Group>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
