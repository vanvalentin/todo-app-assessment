import * as SelectPrimitive from "@radix-ui/react-select";
import checkIcon from "../../assets/tasks/check.svg";
import chevronIcon from "../../assets/tasks/select-chevron.svg";
import styles from "./Select.module.scss";

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

interface SelectProps {
  readonly label: string;
  readonly value: string;
  readonly options: readonly SelectOption[];
  readonly onChange: (value: string) => void;
  readonly disabled?: boolean;
}

/** Shared Radix select used by board filters; task property pills use the same primitive behavior. */
export function Select({ label, value, options, onChange, disabled }: SelectProps) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onChange} disabled={disabled}>
      <SelectPrimitive.Trigger className={styles.trigger} aria-label={label}>
        <SelectPrimitive.Value />
        <SelectPrimitive.Icon className={styles.icon}>
          <img src={chevronIcon} alt="" width={18} height={18} />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content className={styles.content} position="popper" sideOffset={6}>
          <SelectPrimitive.Viewport className={styles.viewport}>
            <SelectPrimitive.Group>
              <SelectPrimitive.Label className={styles.heading}>{label}</SelectPrimitive.Label>
              {options.map((option) => (
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
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
