import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { newKeyValue } from "../../lib/factories";
import type { Auth, AuthType, RequestBody } from "../../lib/model";
import { AuthEditor, defaultAuth } from "./AuthEditor";
import { BodyEditor } from "./BodyEditor";
import { KeyValueEditor } from "./KeyValueEditor";

describe("AuthEditor", () => {
  const cases: [AuthType, string[]][] = [
    ["basic", ["Username", "Password"]],
    ["bearer", ["Token"]],
    ["apikey", ["Key", "Value"]],
    ["oauth2", ["Token URL", "Client ID", "Client Secret", "Scope", "Access Token"]],
  ];

  it.each(cases)("edits every %s field", (type, fields) => {
    const onChange = vi.fn();
    render(<AuthEditor auth={defaultAuth(type)} onChange={onChange} />);
    for (const field of fields) {
      fireEvent.change(screen.getByLabelText(field), { target: { value: `v-${field}` } });
    }
    expect(onChange).toHaveBeenCalledTimes(fields.length);
  });

  it("switches the API key location", () => {
    const onChange = vi.fn();
    render(<AuthEditor auth={defaultAuth("apikey")} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Add to"), { target: { value: "query" } });
    expect(onChange).toHaveBeenCalledWith({ type: "apikey", key: "", value: "", in: "query" });
  });

  it("hides inherit when not allowed and renders oauth actions", () => {
    const auth: Auth = defaultAuth("oauth2");
    render(
      <AuthEditor
        auth={auth}
        onChange={vi.fn()}
        allowInherit={false}
        oauthActions={<button>Get token</button>}
      />,
    );
    expect(screen.queryByRole("option", { name: "Inherit auth from parent" })).toBeNull();
    expect(screen.getByRole("button", { name: "Get token" })).toBeInTheDocument();
  });

  it("creates defaults for every type", () => {
    expect(defaultAuth("none")).toEqual({ type: "none" });
    expect(defaultAuth("inherit")).toEqual({ type: "inherit" });
  });
});

describe("BodyEditor", () => {
  const renderBody = (body: RequestBody) => {
    const onChange = vi.fn();
    render(<BodyEditor body={body} onChange={onChange} />);
    return onChange;
  };

  it("keeps fields when switching between form modes", () => {
    const fields = [newKeyValue("a", "1")];
    const onChange = renderBody({ mode: "urlencoded", fields });
    fireEvent.click(screen.getByLabelText("form-data"));
    expect(onChange).toHaveBeenCalledWith({ mode: "formdata", fields });
  });

  it("switches to none and to raw", () => {
    const onChange = renderBody({ mode: "raw", raw: "x", language: "json" });
    fireEvent.click(screen.getByLabelText("none"));
    expect(onChange).toHaveBeenCalledWith({ mode: "none" });
    fireEvent.change(screen.getByLabelText("Raw language"), { target: { value: "xml" } });
    expect(onChange).toHaveBeenCalledWith({ mode: "raw", raw: "x", language: "xml" });
  });

  it("starts raw bodies empty when coming from another mode", () => {
    const onChange = renderBody({ mode: "none" });
    expect(screen.getByText("This request has no body.")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("raw"));
    expect(onChange).toHaveBeenCalledWith({ mode: "raw", raw: "", language: "json" });
  });

  it("edits form fields", () => {
    const onChange = renderBody({ mode: "formdata", fields: [newKeyValue("a", "1")] });
    fireEvent.change(screen.getByLabelText("Value 1"), { target: { value: "2" } });
    expect(onChange.mock.calls[0][0].fields[0].value).toBe("2");
  });
});

describe("KeyValueEditor", () => {
  it("toggles and removes rows", () => {
    const rows = [newKeyValue("a", "1"), newKeyValue("b", "2")];
    const onChange = vi.fn();
    render(<KeyValueEditor label="kv" rows={rows} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Enable row 1"));
    expect(onChange).toHaveBeenLastCalledWith([{ ...rows[0], enabled: false }, rows[1]]);
    fireEvent.click(screen.getByLabelText("Remove row 2"));
    expect(onChange).toHaveBeenLastCalledWith([rows[0]]);
  });
});
