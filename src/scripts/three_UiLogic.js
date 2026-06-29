import Swal from "sweetalert2";
import logoUrl from "../assets/LogoMarkFull.svg";

// === STATE ===

let loadingTimer = null;

// === CONFIGURATION ===

export const newSwal = Swal.mixin({
  allowOutsideClick: true,
  buttonsStyling: false,
  reverseButtons: true,
  imageUrl: logoUrl,
  imageWidth: 28,
  imageHeight: 28,
  imageAlt: "Logo",
  didOpen: () => {
    const confirmBtn = Swal.getConfirmButton();
    const cancelBtn = Swal.getCancelButton();
    if (confirmBtn) confirmBtn.blur();
    if (cancelBtn) cancelBtn.blur();
    const input = Swal.getInput();
    if (input) input.blur();
  },
  customClass: {
    container: "cusSwal-Container",
    popup: "cusSwal-popup",
    title: "cusSwal-title",
    htmlContainer: "cusSwal-text",
    confirmButton: "cusSwal-button",
    cancelButton: "cusSwal-button",
    denyButton: "cusSwal-button",
    image: "cusSwal-image",
  },
});

// === UI HELPERS ===

export const showDelayedSpinner = (
  title = "Parsing GIF...",
  text = "Large file detected, just a moment!",
) => {
  loadingTimer = setTimeout(() => {
    newSwal.fire({
      title,
      text,
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });
  }, 2000);
};

export const showLoadingAlert = (title, text) => {
  newSwal.fire({
    title,
    text,
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading(),
  });
};

export const hideSpinner = () => {
  if (loadingTimer) clearTimeout(loadingTimer);
  if (Swal.isVisible()) Swal.close();
};

export const closeAlert = () => {
  if (Swal.isVisible()) Swal.close();
};

export const showSuccessAlert = (title, message) => {
  newSwal.fire({
    title,
    text: message,
    timer: 4000,
    showConfirmButton: false,
  });
};

export const showErrorAlert = (title, message) => {
  Swal.fire(title, message, "error");
};

export const promptImageExportFormat = () => {
  return newSwal.fire({
    title: "Image Export",
    text: "Please choose a format.",
    showDenyButton: true,
    showCancelButton: true,
    confirmButtonText: ".svg",
    denyButtonText: ".png",
    cancelButtonText: ".jpg",
  });
};

export const promptVideoExportFormat = () => {
  return newSwal.fire({
    title: "Video Export",
    text: "Select a file format to render your animation loop.",
    showDenyButton: true,
    showCancelButton: true,
    confirmButtonText: ".mov",
    denyButtonText: ".mp4",
    cancelButtonText: ".webm",
  });
};

export const triggerDownload = (url, filename, shouldRevoke = false) => {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  if (shouldRevoke) URL.revokeObjectURL(url);
};

export const changeColourBG = (selectedOption) => {
  const currentBg = document.querySelector(".cus-bgColour");
  const pageDeco = document.querySelectorAll(".cus-pageDeco");

  if (!currentBg) return selectedOption;

  currentBg.classList.remove(
    "bg-ApplyMaroon",
    "bg-ApplyDark",
    "bg-ApplyWhite",
    "bg-ApplyOrange",
    "border-2",
    "border-ApplyWhite",
  );

  if (selectedOption === "ColourMaroon") {
    pageDeco.forEach((el) => el.classList.add("hidden"));
    currentBg.classList.add("bg-ApplyMaroon");
  } else if (selectedOption === "ColourBlack") {
    currentBg.classList.add("border-2", "border-ApplyWhite", "bg-ApplyDark");
  } else if (selectedOption === "ColourWhite") {
    currentBg.classList.add("bg-ApplyWhite");
  } else {
    currentBg.classList.add("bg-ApplyOrange");
  }

  return selectedOption;
};
