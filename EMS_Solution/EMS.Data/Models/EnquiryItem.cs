using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace EMS.Data.Models;

public class EnquiryItem
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int ItemID { get; set; }

    [Required]
    [StringLength(100)]
    public string ItemName { get; set; } = string.Empty;

    [StringLength(255)]
    public string? CompanyName { get; set; }

    [StringLength(100)]
    public string? DepartmentName { get; set; }

    [StringLength(20)]
    public string Status { get; set; } = "Active";

    public string? CommonMailIds { get; set; }

    public string? CCMailIds { get; set; }
}
