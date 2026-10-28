export const History = ({ job }: { job: { status: string } }) => (
  <div>
    <td safe>{job.status}</td>
    <script>{`
      const confirmed = confirm(\`Are you sure you want to delete \${jobIds.length} job(s)? This action cannot be undone.\`);
      alert(\`Successfully deleted \${result.deleted} job(s).\${result.failed > 0 ? \` Failed to delete \${result.failed} job(s).\` : ''}\`);
      alert('Failed to delete jobs. Please try again.');
      alert('An error occurred while deleting jobs. Please try again.');
    `}</script>
  </div>
);
