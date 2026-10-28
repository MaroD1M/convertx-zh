export const Results = ({ file }: { file: { status: string } }) => (
  <table>
    <tbody>
      <tr>
        <td safe>{file.status}</td>
      </tr>
    </tbody>
  </table>
);
