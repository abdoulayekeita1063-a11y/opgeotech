import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BenchForm } from "@/lib/stabilityForm";

export default function SlopeBenchFields({
  bench,
  index,
  onChange,
  disabled = false,
}: {
  bench: BenchForm;
  index: number;
  onChange: (field: keyof BenchForm, value: string) => void;
  disabled?: boolean;
}) {
  const numericField = (
    field: keyof BenchForm,
    label: string,
    min: number,
    max: number,
    step = "any"
  ) => {
    const id = `bench-${index + 1}-${field}`;
    return (
      <div key={field}>
        <Label htmlFor={id} className="swiss-label mb-1 block text-[10px]">
          {label}
        </Label>
        <Input
          id={id}
          aria-label={`Bench ${index + 1} ${label}`}
          type="number"
          min={min}
          max={max}
          step={step}
          value={bench[field]}
          onChange={event => onChange(field, event.target.value)}
          disabled={disabled}
        />
      </div>
    );
  };
  return (
    <div className="space-y-3" data-bench-fields={index + 1}>
      <div className="grid grid-cols-2 gap-3">
        {numericField("angle", "Face angle (°)", 10, 85)}
        {numericField("height", "Slope height (m)", 0.1, 500)}
        {numericField("unitWeight", "Unit weight γ (kN/m³)", 10, 35)}
        <div>
          <Label
            htmlFor={`bench-${index + 1}-groundwater`}
            className="swiss-label mb-1 block text-[10px]"
          >
            Groundwater
          </Label>
          <Select
            value={bench.waterCondition}
            onValueChange={value => onChange("waterCondition", value)}
            disabled={disabled}
          >
            <SelectTrigger
              id={`bench-${index + 1}-groundwater`}
              aria-label={`Bench ${index + 1} Groundwater`}
              className="w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dry">Dry (ru = 0)</SelectItem>
              <SelectItem value="partial">
                Partially saturated (ru = 0.25)
              </SelectItem>
              <SelectItem value="saturated">Saturated (ru = 0.5)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {numericField("bermWidth", "Berm width (m)", 0, 200)}
      </div>
      <div>
        <Label
          htmlFor={`bench-${index + 1}-strength-model`}
          className="swiss-label mb-1 block text-[10px]"
        >
          Strength model
        </Label>
        <Select
          value={bench.strengthModel}
          onValueChange={value => onChange("strengthModel", value)}
          disabled={disabled}
        >
          <SelectTrigger
            id={`bench-${index + 1}-strength-model`}
            aria-label={`Bench ${index + 1} Strength model`}
            className="w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="mohr-coulomb">Mohr–Coulomb</SelectItem>
            <SelectItem value="hoek-brown">Hoek–Brown</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {bench.strengthModel === "mohr-coulomb" ? (
        <div
          className="grid grid-cols-2 gap-3"
          data-strength-fields="mohr-coulomb"
        >
          {numericField("cohesion", "Cohesion c′ (kPa)", 0, 1000)}
          {numericField("frictionAngle", "Friction angle φ′ (°)", 0, 60)}
        </div>
      ) : (
        <div
          className="grid grid-cols-2 gap-3"
          data-strength-fields="hoek-brown"
        >
          {numericField("sigmaCi", "UCS σci (MPa)", 0.1, 1000)}
          {numericField("gsi", "GSI", 0, 100)}
          {numericField("mi", "mi", 1, 50)}
          {numericField("disturbanceFactor", "Disturbance D", 0, 1, "0.1")}
        </div>
      )}
    </div>
  );
}
