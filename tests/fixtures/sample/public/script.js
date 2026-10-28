const renderRow = (file) => {
  row.innerHTML = `
    <td>${file.name}</td>
    <td>${(file.size / 1024).toFixed(2)} kB</td>
    <td><button onclick="deleteRow(this)">Remove</button></td>
  `;
};

const setTitle = () => {
  const title = document.querySelector("h1");
  title.textContent = `Convert ${fileType ? `.${fileType}` : ""}`;
};

for (const target of targets) {
  target.onmousedown = () => {
    convertToInput.value = `${target.dataset.target} using ${target.dataset.converter}`;
  };
}

convertToInput.addEventListener("search", () => {
  // when the user clears the search bar using the 'x' button
  convertButton.disabled = true;
});

convertButton.textContent = "Uploading...";
