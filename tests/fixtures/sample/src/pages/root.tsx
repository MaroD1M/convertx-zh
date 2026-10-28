export const Root = ({ file }: { file: { status: string } }) => (
  <main>
    <h1>Convert</h1>
    <b>Choose a file</b> or drag it here
    <input placeholder="Search for conversions" aria-label="Convert to" />
    <select>
      <option>Convert to</option>
    </select>
    <span title="Select all">Select all</span>
    <p>{file.status}</p>
  </main>
);
